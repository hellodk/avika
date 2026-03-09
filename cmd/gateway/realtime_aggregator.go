package main

import (
	"strconv"
	"sync"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

const (
	realtimeMaxWindowSec = 300
	realtimeBucketSec    = 1
	realtimeNumBuckets   = realtimeMaxWindowSec / realtimeBucketSec
	topEndpointsLimit    = 10
	topAgentsLimit       = 10
)

// realtimeBucket holds per-second counts for one agent.
type realtimeBucket struct {
	Requests   int64
	Errors     int64
	Bytes      int64
	StatusCodes map[string]int64
	Endpoints  map[string]*realtimeEndpointCount
}

type realtimeEndpointCount struct {
	Requests int64
	Bytes    int64
}

// agentBuckets holds sliding-window buckets for one agent (key = unix second).
type agentBuckets struct {
	mu      sync.RWMutex
	buckets map[int64]*realtimeBucket
}

// RealtimeAggregator maintains per-agent sliding-window stats from the log stream.
type RealtimeAggregator struct {
	mu    sync.RWMutex
	agents map[string]*agentBuckets
}

// RealtimeStats is the JSON response for realtime-stats API.
type RealtimeStats struct {
	WindowSec      int                     `json:"window_sec"`
	TotalRequests  int64                   `json:"total_requests"`
	TotalErrors    int64                   `json:"total_errors"`
	ErrorRatePct   float64                 `json:"error_rate_pct"`
	TotalBytes     int64                   `json:"total_bytes"`
	StatusCodes    map[string]int64        `json:"status_codes"`
	TopEndpoints   []RealtimeEndpointStat  `json:"top_endpoints"`
	TopAgents      []RealtimeAgentStat     `json:"top_agents,omitempty"` // only for group
	RequestRatePerSec float64              `json:"request_rate_per_sec,omitempty"`
}

type RealtimeEndpointStat struct {
	URI      string `json:"uri"`
	Requests int64  `json:"requests"`
	Bytes    int64  `json:"bytes"`
	Errors   int64  `json:"errors,omitempty"`
}

type RealtimeAgentStat struct {
	AgentID   string `json:"agent_id"`
	Requests  int64  `json:"requests"`
	Bytes     int64  `json:"bytes"`
	ErrorRate float64 `json:"error_rate_pct,omitempty"`
}

func NewRealtimeAggregator() *RealtimeAggregator {
	return &RealtimeAggregator{
		agents: make(map[string]*agentBuckets),
	}
}

func (ra *RealtimeAggregator) getOrCreate(agentID string) *agentBuckets {
	ra.mu.RLock()
	ab, ok := ra.agents[agentID]
	ra.mu.RUnlock()
	if ok {
		return ab
	}
	ra.mu.Lock()
	defer ra.mu.Unlock()
	if ab, ok = ra.agents[agentID]; ok {
		return ab
	}
	ab = &agentBuckets{buckets: make(map[int64]*realtimeBucket)}
	ra.agents[agentID] = ab
	return ab
}

// Add records one log entry for the given agent (call from gateway when LogEntry is received).
func (ra *RealtimeAggregator) Add(agentID string, entry *pb.LogEntry) {
	if entry == nil {
		return
	}
	ab := ra.getOrCreate(agentID)
	ts := entry.Timestamp
	if ts <= 0 {
		ts = time.Now().Unix()
	}
	bucketKey := ts

	ab.mu.Lock()
	defer ab.mu.Unlock()

	b, ok := ab.buckets[bucketKey]
	if !ok {
		b = &realtimeBucket{
			StatusCodes: make(map[string]int64),
			Endpoints:   make(map[string]*realtimeEndpointCount),
		}
		ab.buckets[bucketKey] = b
	}

	b.Requests++
	b.Bytes += entry.BodyBytesSent
	if entry.Status >= 400 {
		b.Errors++
	}
	statusKey := strconv.Itoa(int(entry.Status))
	b.StatusCodes[statusKey]++

	uri := entry.RequestUri
	if uri == "" {
		uri = "/"
	}
	if b.Endpoints[uri] == nil {
		b.Endpoints[uri] = &realtimeEndpointCount{}
	}
	b.Endpoints[uri].Requests++
	b.Endpoints[uri].Bytes += entry.BodyBytesSent

	// Prune buckets older than realtimeMaxWindowSec
	now := time.Now().Unix()
	cutoff := now - realtimeMaxWindowSec
	for k := range ab.buckets {
		if k < cutoff {
			delete(ab.buckets, k)
		}
	}
}

// Stats returns real-time stats for one agent over the last windowSec seconds.
func (ra *RealtimeAggregator) Stats(agentID string, windowSec int) *RealtimeStats {
	if windowSec <= 0 {
		windowSec = 60
	}
	if windowSec > realtimeMaxWindowSec {
		windowSec = realtimeMaxWindowSec
	}

	ra.mu.RLock()
	ab, ok := ra.agents[agentID]
	ra.mu.RUnlock()
	if !ok {
		return emptyRealtimeStats(windowSec)
	}

	ab.mu.RLock()
	now := time.Now().Unix()
	cutoff := now - int64(windowSec)
	var totalReqs, totalErrs, totalBytes int64
	statusCodes := make(map[string]int64)
	endpoints := make(map[string]*realtimeEndpointCount)

	for k, b := range ab.buckets {
		if k < cutoff {
			continue
		}
		totalReqs += b.Requests
		totalErrs += b.Errors
		totalBytes += b.Bytes
		for sc, c := range b.StatusCodes {
			statusCodes[sc] += c
		}
		for uri, ec := range b.Endpoints {
			if endpoints[uri] == nil {
				endpoints[uri] = &realtimeEndpointCount{}
			}
			endpoints[uri].Requests += ec.Requests
			endpoints[uri].Bytes += ec.Bytes
		}
	}
	ab.mu.RUnlock()

	// Build top endpoints (by requests)
	topEndpoints := topEndpointsFromMap(endpoints, totalReqs, totalErrs)

	errRate := 0.0
	if totalReqs > 0 {
		errRate = float64(totalErrs) / float64(totalReqs) * 100
	}
	reqRate := 0.0
	if int64(windowSec) > 0 {
		reqRate = float64(totalReqs) / float64(windowSec)
	}

	return &RealtimeStats{
		WindowSec:         windowSec,
		TotalRequests:     totalReqs,
		TotalErrors:       totalErrs,
		ErrorRatePct:      errRate,
		TotalBytes:        totalBytes,
		StatusCodes:       statusCodes,
		TopEndpoints:      topEndpoints,
		RequestRatePerSec: reqRate,
	}
}

// StatsGroup merges real-time stats for multiple agents (e.g. a group).
func (ra *RealtimeAggregator) StatsGroup(agentIDs []string, windowSec int) *RealtimeStats {
	if windowSec <= 0 {
		windowSec = 60
	}
	if windowSec > realtimeMaxWindowSec {
		windowSec = realtimeMaxWindowSec
	}
	if len(agentIDs) == 0 {
		return emptyRealtimeStats(windowSec)
	}

	var totalReqs, totalErrs, totalBytes int64
	statusCodes := make(map[string]int64)
	endpoints := make(map[string]*realtimeEndpointCount)
	agentReqs := make(map[string]int64)
	agentBytes := make(map[string]int64)
	agentErrs := make(map[string]int64)

	now := time.Now().Unix()
	cutoff := now - int64(windowSec)

	for _, agentID := range agentIDs {
		ra.mu.RLock()
		ab, ok := ra.agents[agentID]
		ra.mu.RUnlock()
		if !ok {
			continue
		}
		ab.mu.RLock()
		var aReqs, aErrs, aBytes int64
		for k, b := range ab.buckets {
			if k < cutoff {
				continue
			}
			aReqs += b.Requests
			aErrs += b.Errors
			aBytes += b.Bytes
			totalReqs += b.Requests
			totalErrs += b.Errors
			totalBytes += b.Bytes
			for sc, c := range b.StatusCodes {
				statusCodes[sc] += c
			}
			for uri, ec := range b.Endpoints {
				if endpoints[uri] == nil {
					endpoints[uri] = &realtimeEndpointCount{}
				}
				endpoints[uri].Requests += ec.Requests
				endpoints[uri].Bytes += ec.Bytes
			}
		}
		ab.mu.RUnlock()
		agentReqs[agentID] = aReqs
		agentBytes[agentID] = aBytes
		agentErrs[agentID] = aErrs
	}

	topEndpoints := topEndpointsFromMap(endpoints, totalReqs, totalErrs)
	topAgents := topAgentsFromMap(agentReqs, agentBytes, agentErrs)

	errRate := 0.0
	if totalReqs > 0 {
		errRate = float64(totalErrs) / float64(totalReqs) * 100
	}
	reqRate := 0.0
	if int64(windowSec) > 0 {
		reqRate = float64(totalReqs) / float64(windowSec)
	}

	return &RealtimeStats{
		WindowSec:         windowSec,
		TotalRequests:     totalReqs,
		TotalErrors:       totalErrs,
		ErrorRatePct:      errRate,
		TotalBytes:        totalBytes,
		StatusCodes:       statusCodes,
		TopEndpoints:      topEndpoints,
		TopAgents:         topAgents,
		RequestRatePerSec: reqRate,
	}
}

func emptyRealtimeStats(windowSec int) *RealtimeStats {
	return &RealtimeStats{
		WindowSec:     windowSec,
		StatusCodes:   make(map[string]int64),
		TopEndpoints:  []RealtimeEndpointStat{},
		TopAgents:     []RealtimeAgentStat{},
	}
}

func topEndpointsFromMap(endpoints map[string]*realtimeEndpointCount, totalReqs, totalErrs int64) []RealtimeEndpointStat {
	type pair struct {
		uri string
		ec  *realtimeEndpointCount
	}
	var list []pair
	for uri, ec := range endpoints {
		list = append(list, pair{uri, ec})
	}
	// Sort by requests descending
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[j].ec.Requests > list[i].ec.Requests {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
	n := topEndpointsLimit
	if len(list) < n {
		n = len(list)
	}
	out := make([]RealtimeEndpointStat, 0, n)
	for i := 0; i < n; i++ {
		p := list[i]
		out = append(out, RealtimeEndpointStat{
			URI:      p.uri,
			Requests: p.ec.Requests,
			Bytes:    p.ec.Bytes,
		})
	}
	return out
}

func topAgentsFromMap(agentReqs, agentBytes, agentErrs map[string]int64) []RealtimeAgentStat {
	type pair struct {
		id    string
		reqs  int64
		bytes int64
		errs  int64
	}
	var list []pair
	for id, reqs := range agentReqs {
		list = append(list, pair{id, reqs, agentBytes[id], agentErrs[id]})
	}
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[j].reqs > list[i].reqs {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
	n := topAgentsLimit
	if len(list) < n {
		n = len(list)
	}
	out := make([]RealtimeAgentStat, 0, n)
	for i := 0; i < n; i++ {
		p := list[i]
		errRate := 0.0
		if p.reqs > 0 {
			errRate = float64(p.errs) / float64(p.reqs) * 100
		}
		out = append(out, RealtimeAgentStat{
			AgentID:    p.id,
			Requests:   p.reqs,
			Bytes:      p.bytes,
			ErrorRate:  errRate,
		})
	}
	return out
}
