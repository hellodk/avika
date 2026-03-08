package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	"github.com/avika-ai/avika/cmd/gateway/middleware"
	"github.com/avika-ai/avika/internal/common/logging"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/segmentio/kafka-go"
	"github.com/rs/zerolog"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/peer"
)

type EndpointStats struct {
	Requests  int64
	Errors    int64
	Latency   float64 // Sum of latency
	P95       float64 // Approximate
	BytesSent int64
}

type AnalyticsCache struct {
	sync.RWMutex
	TotalRequests  int64
	TotalErrors    int64
	TotalBytes     int64
	StatusCodes    map[string]int64
	EndpointStats  map[string]*EndpointStats
	RequestHistory []*pb.TimeSeriesPoint // Last 24h by hour or minute
}

type server struct {
	pb.UnimplementedCommanderServer
	pb.UnimplementedAgentServiceServer

	// Map agent_id -> *AgentSession
	sessions sync.Map

	// Map agent_id -> []*pb.UptimeReport
	uptimeReports sync.Map

	// List of recommendations (simple in-memory store for MVP)
	recommendations []*pb.Recommendation
	recMu           sync.RWMutex

	db         *DB
	clickhouse *ClickHouseDB
	alerts     *AlertEngine
	analytics  *AnalyticsCache // Keep for legacy/fallback or remove later
	config     *config.Config
	pskManager *middleware.PSKManager

	// AI Error Analysis
	errorAnalysisAPI *ErrorAnalysisAPI

	// Monitoring stats (atomic)
	messageCount int64 // total messages received since last tick
	dbLatencySum int64 // sum of DB latency in ns (use atomic)
	dbOpCount    int64 // total DB operations since last tick
}

// gatewayLog is the structured logger for the gateway (agent_id, hostname, ip added per event where available).
var gatewayLog zerolog.Logger

type AgentSession struct {
	id               string
	hostname         string
	version          string // NGINX version
	agentVersion     string // Agent binary version
	buildDate        string // Build timestamp
	gitCommit        string // Git commit hash
	gitBranch        string // Git branch name
	instancesCount   int
	uptime           string
	ip               string
	mgmtAddress      string // Optional host:port from agent heartbeat for dial-back (correct-IP)
	stream           pb.Commander_ConnectServer
	logChans         map[string]chan *pb.LogEntry // subscription_id -> channel
	mu               sync.Mutex
	lastActive       time.Time
	status           string // "online" or "offline"
	isPod            bool
	podIP            string
	pskAuthenticated bool              // true if agent connected with valid PSK
	labels           map[string]string // Agent labels for auto-assignment (project, environment)
}

func (s *server) Connect(stream pb.Commander_ConnectServer) error {
	// ... (existing logging) ...

	var currentSession *AgentSession

	defer func() {
		if currentSession != nil {
			currentSession.mu.Lock()
			currentSession.status = "offline"
			currentSession.lastActive = time.Now()
			currentSession.stream = nil // Clear stream

			agentLog := logging.WithAgent(gatewayLog, currentSession.id, currentSession.hostname, currentSession.ip)
			// Persist offline status
			if err := s.db.UpsertAgent(currentSession); err != nil {
				agentLog.Warn().Err(err).Msg("Failed to update agent status in DB")
			}

			currentSession.mu.Unlock()
			agentLog.Info().Msg("Agent disconnected (marked offline)")
		}
	}()

	for {
		msg, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			if currentSession != nil {
				agentLog := logging.WithAgent(gatewayLog, currentSession.id, currentSession.hostname, currentSession.ip)
				agentLog.Error().Err(err).Msg("Stream error")
			} else {
				gatewayLog.Error().Err(err).Msg("Stream error (no agent session yet)")
			}
			return err
		}

		// Log message
		// log.Printf("Received message from agent %s: type %T", msg.AgentId, msg.Payload)
		atomic.AddInt64(&s.messageCount, 1)

		switch payload := msg.Payload.(type) {
		case *pb.AgentMessage_Heartbeat:
			hb := payload.Heartbeat
			agentID := msg.AgentId

			// 0. Extract IP from peer context
			ip := "unknown"
			if p, ok := peer.FromContext(stream.Context()); ok {
				ip = p.Addr.String()
				if host, _, err := net.SplitHostPort(ip); err == nil {
					ip = host
				}
			}

			// 1. Smart Version Fallback
			nginxVersion := hb.Version
			agentVer := hb.AgentVersion
			if len(hb.Instances) > 0 && hb.Instances[0].Version != "unknown" && hb.Instances[0].Version != "" {
				nginxVersion = hb.Instances[0].Version
			}
			// If AgentVersion is empty, then hb.Version was likely the agent version (old agents)
			if agentVer == "" && hb.Version != "" && hb.Version != nginxVersion {
				agentVer = hb.Version
			}
			if agentVer == "" {
				agentVer = "0.1.0" // Default fallback
			}

			// 2. Smart Pod Detection Fallback (if agent fails to detect it)
			isPod := hb.IsPod
			if !isPod {
				// K8s pods usually have hostnames like <deployment>-<replicaset>-<hash>
				// Standard pattern is [a-z0-9]([-a-z0-9]*[a-z0-9])? (\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*
				parts := strings.Split(hb.Hostname, "-")
				if len(parts) >= 3 && len(parts[len(parts)-1]) >= 4 && len(parts[len(parts)-2]) >= 4 {
					isPod = true
				}
			}

			// 3. Check PSK authentication status
			pskAuthenticated := false
			if authStatus := middleware.GetPSKAuthStatus(stream.Context()); authStatus != nil {
				pskAuthenticated = authStatus.Authenticated
			}

			// 4. Register/Update session
			val, loaded := s.sessions.Load(agentID)
			if !loaded {
				currentSession = &AgentSession{
					id:               agentID,
					hostname:         hb.Hostname,
					version:          nginxVersion,
					agentVersion:     agentVer,
					buildDate:        hb.BuildDate,
					gitCommit:        hb.GitCommit,
					gitBranch:        hb.GitBranch,
					instancesCount:   len(hb.Instances),
					uptime:           fmt.Sprintf("%.1fs", hb.Uptime),
					stream:           stream,
					logChans:         make(map[string]chan *pb.LogEntry),
					status:           "online",
					lastActive:       time.Now(),
					ip:               ip,
					mgmtAddress:      hb.GetMgmtAddress(),
					isPod:            isPod,
					podIP:            hb.PodIp,
					pskAuthenticated: pskAuthenticated,
					labels:           hb.Labels,
				}
				s.sessions.Store(agentID, currentSession)
				agentLog := logging.WithAgent(gatewayLog, agentID, hb.Hostname, ip)
				mgmt := hb.GetMgmtAddress()
				if mgmt != "" {
					agentLog.Info().Bool("pod", isPod).Bool("psk", pskAuthenticated).Str("mgmt_address", mgmt).Msg("Agent registered (dial will use mgmt_address)")
				} else {
					agentLog.Info().Bool("pod", isPod).Bool("psk", pskAuthenticated).Msg("Agent registered (dial will use peer IP)")
				}

				// 4a. Auto-assign to environment based on labels
				if len(hb.Labels) > 0 {
					s.autoAssignAgentToEnvironment(agentID, hb.Labels)
				}
			} else {
				// Reconnecting - update existing session
				currentSession = val.(*AgentSession)
				currentSession.mu.Lock()
				currentSession.stream = stream
				currentSession.status = "online"
				currentSession.hostname = hb.Hostname
				currentSession.ip = ip
				currentSession.mgmtAddress = hb.GetMgmtAddress()
				currentSession.version = nginxVersion
				currentSession.agentVersion = agentVer
				currentSession.buildDate = hb.BuildDate
				currentSession.gitCommit = hb.GitCommit
				currentSession.gitBranch = hb.GitBranch
				currentSession.instancesCount = len(hb.Instances)
				currentSession.uptime = fmt.Sprintf("%.2fs", hb.Uptime)
				currentSession.isPod = isPod
				currentSession.podIP = hb.PodIp
				currentSession.pskAuthenticated = pskAuthenticated
				currentSession.lastActive = time.Now()
				currentSession.labels = hb.Labels
				currentSession.mu.Unlock()

				// Try auto-assignment on reconnection if agent has labels but no assignment
				if len(hb.Labels) > 0 {
					existing, err := s.db.GetServerAssignment(agentID)
					if err != nil || existing == nil {
						agentLog := logging.WithAgent(gatewayLog, agentID, hb.Hostname, ip)
						agentLog.Info().Interface("labels", hb.Labels).Msg("Attempting auto-assign for reconnected agent")
						s.autoAssignAgentToEnvironment(agentID, hb.Labels)
					}
				}
			}

			// Persist to DB
			if err := s.db.UpsertAgent(currentSession); err != nil {
				agentLog := logging.WithAgent(gatewayLog, currentSession.id, currentSession.hostname, currentSession.ip)
				agentLog.Warn().Err(err).Msg("Failed to persist agent heartbeat")
			}

			// Log heartbeat at debug to avoid flooding (info shows register/disconnect only)
			agentLog := logging.WithAgent(gatewayLog, currentSession.id, currentSession.hostname, currentSession.ip)
			agentLog.Debug().Str("version", hb.Version).Int("nginx_instances", len(hb.Instances)).Msg("Heartbeat received")

		case *pb.AgentMessage_LogEntry:
			if currentSession != nil {
				entry := payload.LogEntry

				// 1. Distribute to subscribers
				currentSession.mu.Lock()
				for _, ch := range currentSession.logChans {
					select {
					case ch <- entry:
					default:
					}
				}
				currentSession.mu.Unlock()

				// 2. Insert into ClickHouse
				if s.clickhouse != nil {
					// Async insert/batching would be better, but sync for now
					go func(e *pb.LogEntry, agentID string) {
						start := time.Now()
						if err := s.clickhouse.InsertAccessLog(e, agentID); err != nil {
							log.Printf("Failed to insert log to CH: %v", err)
						}
						s.trackDBOp(start)
					}(entry, currentSession.id)
				}

				// 3. Aggregate Analytics (Legacy in-memory, keep for now as fallback/realtime cache)
				s.analytics.Lock()
				s.analytics.TotalRequests++
				if entry.Status >= 400 {
					s.analytics.TotalErrors++
				}

				statusKey := fmt.Sprintf("%d", entry.Status)
				s.analytics.StatusCodes[statusKey]++

				// Endpoint Stats
				if _, ok := s.analytics.EndpointStats[entry.RequestUri]; !ok {
					s.analytics.EndpointStats[entry.RequestUri] = &EndpointStats{}
				}
				stats := s.analytics.EndpointStats[entry.RequestUri]
				stats.Requests++
				stats.BytesSent += entry.BodyBytesSent
				if entry.Status >= 400 {
					stats.Errors++
				}
				stats.Latency += float64(entry.RequestTime)
				s.analytics.TotalBytes += entry.BodyBytesSent

				// Update TimeSeries (bucketing by hour for simplicity in this snippet)
				// In a real impl, we'd have a ticker to create new buckets.
				// Here we just append to the last bucket or create one.
				nowStr := time.Now().Format("15:00")
				if len(s.analytics.RequestHistory) == 0 {
					s.analytics.RequestHistory = append(s.analytics.RequestHistory, &pb.TimeSeriesPoint{Time: nowStr})
				}
				lastPoint := s.analytics.RequestHistory[len(s.analytics.RequestHistory)-1]
				if lastPoint.Time != nowStr {
					s.analytics.RequestHistory = append(s.analytics.RequestHistory, &pb.TimeSeriesPoint{Time: nowStr})
					lastPoint = s.analytics.RequestHistory[len(s.analytics.RequestHistory)-1]
					// Keep history small
					if len(s.analytics.RequestHistory) > 24 {
						s.analytics.RequestHistory = s.analytics.RequestHistory[1:]
					}
				}
				lastPoint.Requests++
				if entry.Status >= 400 {
					lastPoint.Errors++
				}

				s.analytics.Unlock()
			}

		case *pb.AgentMessage_Metrics:
			if currentSession != nil {
				metrics := payload.Metrics

				// Insert NGINX metrics
				if s.clickhouse != nil {
					go func(m *pb.NginxMetrics, agentID string) {
						start := time.Now()
						if err := s.clickhouse.InsertNginxMetrics(m, agentID); err != nil {
							log.Printf("Failed to insert NGINX metrics to CH: %v", err)
						}
						s.trackDBOp(start)
					}(metrics, currentSession.id)

					// Insert system metrics if present
					if metrics.System != nil {
						go func(sm *pb.SystemMetrics, agentID string) {
							start := time.Now()
							if err := s.clickhouse.InsertSystemMetrics(sm, agentID); err != nil {
								log.Printf("Failed to insert system metrics to CH: %v", err)
							}
							s.trackDBOp(start)
						}(metrics.System, currentSession.id)
					}
				}
			}
		}
	}
}

func (s *server) trackDBOp(start time.Time) {
	atomic.AddInt64(&s.dbOpCount, 1)
	atomic.AddInt64(&s.dbLatencySum, int64(time.Since(start).Nanoseconds()))
}

func (s *server) startGatewayMonitoring() {
	ticker := time.NewTicker(10 * time.Second)
	gatewayID := os.Getenv("GATEWAY_ID")
	if gatewayID == "" {
		hostname, _ := os.Hostname()
		gatewayID = hostname
	}

	log.Printf("Starting gateway monitoring for %s", gatewayID)

	go func() {
		for range ticker.C {
			// 1. Collect EPS (Events Per Second)
			msgs := atomic.SwapInt64(&s.messageCount, 0)
			eps := float32(msgs) / 10.0

			// 2. Collect Active Connections
			activeConns := 0
			s.sessions.Range(func(key, value interface{}) bool {
				session := value.(*AgentSession)
				if session.status == "online" {
					activeConns++
				}
				return true
			})

			// 3. Collect System Stats
			var m runtime.MemStats
			runtime.ReadMemStats(&m)
			memMB := float32(m.Alloc) / 1024 / 1024
			goro := uint32(runtime.NumGoroutine())

			// 4. Collect DB Latency
			dbOps := atomic.SwapInt64(&s.dbOpCount, 0)
			dbLatSum := atomic.SwapInt64(&s.dbLatencySum, 0)
			avgDBLat := float32(0)
			if dbOps > 0 {
				avgDBLat = float32(dbLatSum) / float32(dbOps) / 1000000.0 // ns to ms
			}

			// 5. CPU Usage (simple mock for now)
			cpu := float32(0.5)

			// 6. Persist to ClickHouse
			if s.clickhouse != nil {
				metricPoint := &pb.GatewayMetricPoint{
					Eps:               eps,
					ActiveConnections: int32(activeConns),
					CpuUsage:          cpu,
					MemoryMb:          memMB,
					Goroutines:        int32(goro),
					DbLatency:         avgDBLat,
				}
				if err := s.clickhouse.InsertGatewayMetrics(gatewayID, metricPoint); err != nil {
					log.Printf("Failed to persist gateway metrics: %v", err)
				}
			}
		}
	}()
}

func (s *server) GetLogs(req *pb.LogRequest, stream pb.AgentService_GetLogsServer) error {
	val, ok := s.sessions.Load(req.InstanceId)
	if !ok {
		return fmt.Errorf("agent %s not connected", req.InstanceId)
	}
	session := val.(*AgentSession)

	if session.status == "offline" {
		return fmt.Errorf("agent %s is offline", req.InstanceId)
	}

	// Create subscription channel
	subID := fmt.Sprintf("%d", time.Now().UnixNano())
	logChan := make(chan *pb.LogEntry, 100)

	session.mu.Lock()
	session.logChans[subID] = logChan
	session.mu.Unlock()

	defer func() {
		session.mu.Lock()
		delete(session.logChans, subID)
		session.mu.Unlock()
		close(logChan)
	}()

	// Send Log Request to Agent
	cmdID := fmt.Sprintf("log-%s", subID)
	// Check if stream is active
	if session.stream == nil {
		return fmt.Errorf("agent stream lost")
	}

	err := session.stream.Send(&pb.ServerCommand{
		CommandId: cmdID,
		Payload: &pb.ServerCommand_LogRequest{
			LogRequest: req,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send log request to agent: %w", err)
	}

	// Stream logs to client
	ctx := stream.Context()
	for {
		select {
		case entry := <-logChan:
			if err := stream.Send(entry); err != nil {
				return err
			}
		case <-ctx.Done():
			return nil
		}
	}
}
func (s *server) ListAgents(ctx context.Context, req *pb.ListAgentsRequest) (*pb.ListAgentsResponse, error) {
	var agents []*pb.AgentInfo

	s.sessions.Range(func(key, value interface{}) bool {
		session := value.(*AgentSession)

		status := session.status
		if status == "" {
			status = "online" // Default fallback
		}

		agents = append(agents, &pb.AgentInfo{
			AgentId:          session.id,
			Hostname:         session.hostname,
			Version:          session.version,
			AgentVersion:     session.agentVersion,
			Status:           status,
			InstancesCount:   int32(session.instancesCount),
			Uptime:           session.uptime,
			Ip:               session.ip,
			LastSeen:         session.lastActive.Unix(),
			IsPod:            session.isPod,
			PodIp:            session.podIP,
			BuildDate:        session.buildDate,
			GitCommit:        session.gitCommit,
			GitBranch:        session.gitBranch,
			PskAuthenticated: session.pskAuthenticated,
		})
		return true
	})

	// Use build-time version, fallback to file if needed
	sysVersion := Version
	if strings.Contains(sysVersion, "dev") || sysVersion == "0.0.1" {
		if data, err := os.ReadFile("VERSION"); err == nil {
			sysVersion = strings.TrimSpace(string(data))
		}
	}

	return &pb.ListAgentsResponse{
		Agents:        agents,
		SystemVersion: sysVersion,
	}, nil
}

func (s *server) GetAgent(ctx context.Context, req *pb.GetAgentRequest) (*pb.AgentInfo, error) {
	val, ok := s.sessions.Load(req.AgentId)
	if !ok {
		return nil, fmt.Errorf("agent %s not found", req.AgentId)
	}
	session := val.(*AgentSession)

	return &pb.AgentInfo{
		AgentId:          session.id,
		Hostname:         session.hostname,
		Version:          session.version,
		Status:           session.status,
		InstancesCount:   int32(session.instancesCount),
		Uptime:           session.uptime,
		Ip:               session.ip,
		LastSeen:         session.lastActive.Unix(),
		IsPod:            session.isPod,
		PodIp:            session.podIP,
		AgentVersion:     session.agentVersion,
		PskAuthenticated: session.pskAuthenticated,
	}, nil
}

func (s *server) RemoveAgent(ctx context.Context, req *pb.RemoveAgentRequest) (*pb.RemoveAgentResponse, error) {
	if _, ok := s.sessions.Load(req.AgentId); ok {
		s.sessions.Delete(req.AgentId)

		// Remove from DB
		if err := s.db.RemoveAgent(req.AgentId); err != nil {
			gatewayLog.Warn().Err(err).Str("agent_id", req.AgentId).Msg("Failed to remove agent from DB")
			return &pb.RemoveAgentResponse{Success: false}, nil
		}

		gatewayLog.Info().Str("agent_id", req.AgentId).Msg("Agent manually removed from inventory")
		return &pb.RemoveAgentResponse{Success: true}, nil
	}
	return &pb.RemoveAgentResponse{Success: false}, nil
}

func (s *server) UpdateAgent(ctx context.Context, req *pb.UpdateAgentRequest) (*pb.UpdateAgentResponse, error) {
	val, ok := s.sessions.Load(req.AgentId)
	if !ok {
		return nil, fmt.Errorf("agent %s not found", req.AgentId)
	}
	session := val.(*AgentSession)

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.status != "online" || session.stream == nil {
		return &pb.UpdateAgentResponse{
			Success: false,
			Message: "Agent is offline or has no active stream",
		}, nil
	}

	// Construct the update URL from gateway's HTTP address
	// The gateway serves updates at /updates/ on its HTTP port
	updateURL := fmt.Sprintf("http://%s/updates", s.config.GetHTTPAddress())

	// Send update command
	err := session.stream.Send(&pb.ServerCommand{
		CommandId: fmt.Sprintf("upd-%d", time.Now().Unix()),
		Payload: &pb.ServerCommand_Update{
			Update: &pb.Update{
				Version:   "latest",
				UpdateUrl: updateURL,
			},
		},
	})

	if err != nil {
		return &pb.UpdateAgentResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to send update command: %v", err),
		}, nil
	}

	log.Printf("🚀 Triggered remote update for agent %s", req.AgentId)
	return &pb.UpdateAgentResponse{
		Success: true,
		Message: "Update command sent to agent",
	}, nil
}

func (s *server) GetUptimeReports(ctx context.Context, req *pb.UptimeRequest) (*pb.UptimeResponse, error) {
	val, ok := s.uptimeReports.Load(req.AgentId)
	if !ok {
		return &pb.UptimeResponse{Reports: []*pb.UptimeReport{}}, nil
	}
	reports := val.([]*pb.UptimeReport)

	// Apply limit
	if req.Limit > 0 && int(req.Limit) < len(reports) {
		reports = reports[:req.Limit]
	}

	return &pb.UptimeResponse{Reports: reports}, nil
}

func (s *server) GetAnalytics(ctx context.Context, req *pb.AnalyticsRequest) (*pb.AnalyticsResponse, error) {
	if s.clickhouse != nil {
		// Use the enhanced function with absolute time range support
		timezone := req.Timezone
		if timezone == "" {
			timezone = "UTC"
		}

		// Project/environment filtering takes precedence over single agent_id
		var agentFilter []string
		if req.EnvironmentId != "" {
			// Filter by specific environment
			agents, err := s.db.GetAgentIDsForEnvironment(req.EnvironmentId)
			if err != nil {
				log.Printf("GetAnalytics: Failed to get agents for environment %s: %v", req.EnvironmentId, err)
			} else {
				agentFilter = agents
			}
		} else if req.ProjectId != "" {
			// Filter by project (all environments)
			agents, err := s.db.GetAgentIDsForProject(req.ProjectId)
			if err != nil {
				log.Printf("GetAnalytics: Failed to get agents for project %s: %v", req.ProjectId, err)
			} else {
				agentFilter = agents
			}
		}

		// Use filtered query if we have agent filter, otherwise use standard query
		if len(agentFilter) > 0 {
			return s.clickhouse.GetAnalyticsWithAgentFilter(ctx, req.TimeWindow, "", agentFilter, req.FromTimestamp, req.ToTimestamp, timezone)
		}
		return s.clickhouse.GetAnalyticsWithTimeRange(ctx, req.TimeWindow, req.AgentId, req.FromTimestamp, req.ToTimestamp, timezone)
	}

	// Fallback to in-memory if ClickHouse not available
	s.analytics.RLock()
	defer s.analytics.RUnlock()

	// Determine how many data points to return based on time window
	maxPoints := 24 // default for 24h
	switch req.TimeWindow {
	case "5m":
		maxPoints = 5 // 1-minute buckets
	case "15m":
		maxPoints = 15 // 1-minute buckets
	case "30m":
		maxPoints = 30 // 1-minute buckets
	case "1h":
		maxPoints = 60 // 1-minute buckets
	case "3h":
		maxPoints = 36 // 5-minute buckets
	case "6h":
		maxPoints = 72 // 5-minute buckets
	case "12h":
		maxPoints = 24 // 30-minute buckets
	case "24h":
		maxPoints = 24 // hourly buckets
	case "2d":
		maxPoints = 48 // hourly buckets
	case "7d":
		maxPoints = 168 // hourly buckets
	case "30d":
		maxPoints = 720 // hourly buckets
	}

	// Filter RequestHistory based on time window
	requestHistory := s.analytics.RequestHistory
	if len(requestHistory) > maxPoints {
		requestHistory = requestHistory[len(requestHistory)-maxPoints:]
	}

	// Convert Status Codes
	var statusDist []*pb.StatusCount
	for k, v := range s.analytics.StatusCodes {
		statusDist = append(statusDist, &pb.StatusCount{Code: k, Count: v})
	}

	// Convert Top Endpoints
	var topEndpoints []*pb.EndpointStat
	for k, v := range s.analytics.EndpointStats {
		avgLat := 0.0
		if v.Requests > 0 {
			avgLat = v.Latency / float64(v.Requests)
		}
		topEndpoints = append(topEndpoints, &pb.EndpointStat{
			Uri:      k,
			Requests: v.Requests,
			Errors:   v.Errors,
			P95:      float32(avgLat * 1.5), // Approximation for MVP
			Traffic:  formatBytes(v.BytesSent),
		})
	}

	// Return
	return &pb.AnalyticsResponse{
		RequestRate:        requestHistory,
		StatusDistribution: statusDist,
		TopEndpoints:       topEndpoints,
		LatencyTrend:       []*pb.LatencyPercentiles{}, // Todo
	}, nil
}

func (s *server) StreamAnalytics(req *pb.AnalyticsRequest, stream pb.AgentService_StreamAnalyticsServer) error {
	log.Printf("Starting analytics stream for agent %s (window: %s)", req.AgentId, req.TimeWindow)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Send initial data immediately
	if resp, err := s.GetAnalytics(stream.Context(), req); err == nil {
		if err := stream.Send(resp); err != nil {
			log.Printf("StreamAnalytics initial send error: %v", err)
			return err
		}
	} else {
		log.Printf("StreamAnalytics initial fetch error: %v", err)
	}

	for {
		select {
		case <-stream.Context().Done():
			return nil
		case <-ticker.C:
			resp, err := s.GetAnalytics(stream.Context(), req)
			if err != nil {
				log.Printf("StreamAnalytics error: %v", err)
				continue
			}
			if err := stream.Send(resp); err != nil {
				log.Printf("StreamAnalytics send error: %v", err)
				return err
			}
		}
	}
}

// ... startRecommendationConsumer ...

func (s *server) GetRecommendations(ctx context.Context, req *pb.RecommendationRequest) (*pb.RecommendationResponse, error) {
	s.recMu.RLock()
	defer s.recMu.RUnlock()

	// Create a copy to return
	recs := make([]*pb.Recommendation, len(s.recommendations))
	copy(recs, s.recommendations)

	// In future, filter by agent_id if needed

	return &pb.RecommendationResponse{Recommendations: recs}, nil
}

func (s *server) getAgentClient(agentID string) (pb.AgentServiceClient, *grpc.ClientConn, error) {
	val, ok := s.sessions.Load(agentID)
	if !ok {
		log.Printf("Agent lookup failed for ID: %s", agentID)
		return nil, nil, fmt.Errorf("agent %s not found", agentID)
	}
	session := val.(*AgentSession)

	// Prefer agent-reported mgmt_address (correct-IP); else pods use podIP; else connection IP
	var target string
	if session.mgmtAddress != "" {
		target = session.mgmtAddress
		log.Printf("Using mgmt_address %s for agent %s", target, agentID)
	} else {
		targetIP := session.ip
		if session.isPod && session.podIP != "" {
			targetIP = session.podIP
			log.Printf("Using podIP %s for pod agent %s (connection IP was %s)", targetIP, agentID, session.ip)
		}
		if targetIP == "" {
			log.Printf("Agent %s has no IP (isPod: %v, podIP: %s, ip: %s)", agentID, session.isPod, session.podIP, session.ip)
			return nil, nil, fmt.Errorf("agent %s has no IP", agentID)
		}
		agentPort := s.config.Agent.MgmtPort
		if agentPort == 0 {
			agentPort = config.DefaultAgentPort
		}
		target = fmt.Sprintf("%s:%d", targetIP, agentPort)
	}
	log.Printf("Found session for %s, dialing %s", agentID, target)

	conn, err := grpc.Dial(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to agent %s: %v", agentID, err)
	}

	return pb.NewAgentServiceClient(conn), conn, nil
}

func (s *server) Execute(stream pb.AgentService_ExecuteServer) error {
	// Need to get instance_id from first message
	req, err := stream.Recv()
	if err != nil {
		return err
	}

	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return err
	}
	defer conn.Close()

	agentStream, err := client.Execute(stream.Context())
	if err != nil {
		return err
	}

	// Forward first message
	if err := agentStream.Send(req); err != nil {
		return err
	}

	// Proxy from frontend to agent
	go func() {
		for {
			req, err := stream.Recv()
			if err != nil {
				return
			}
			agentStream.Send(req)
		}
	}()

	// Proxy from agent back to frontend
	for {
		resp, err := agentStream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := stream.Send(resp); err != nil {
			return err
		}
	}
}

func (s *server) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.GetConfig(ctx, req)
}

func (s *server) UpdateConfig(ctx context.Context, req *pb.ConfigUpdate) (*pb.ConfigUpdateResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.UpdateConfig(ctx, req)
}

func (s *server) ValidateConfig(ctx context.Context, req *pb.ConfigValidation) (*pb.ValidationResult, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ValidateConfig(ctx, req)
}

func (s *server) ReloadNginx(ctx context.Context, req *pb.ReloadRequest) (*pb.ReloadResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ReloadNginx(ctx, req)
}

func (s *server) RestartNginx(ctx context.Context, req *pb.RestartRequest) (*pb.RestartResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.RestartNginx(ctx, req)
}

func (s *server) StopNginx(ctx context.Context, req *pb.StopRequest) (*pb.StopResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.StopNginx(ctx, req)
}

func (s *server) ListCertificates(ctx context.Context, req *pb.CertListRequest) (*pb.CertListResponse, error) {
	client, conn, err := s.getAgentClient(req.InstanceId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	return client.ListCertificates(ctx, req)
}

func (s *server) startUptimeCrawler() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			s.sessions.Range(func(key, value interface{}) bool {
				session := value.(*AgentSession)
				agentID := key.(string)

				// Skip offline agents for uptime checks?
				// Currently just mocking, but logically we can't check if offline.
				if session.status == "offline" {
					return true
				}

				status := "UP"
				latency := 0.0 // Real probes not implemented yet, using 0 instead of mock
				var errStr string

				// In a real crawler, we'd do:
				// start := time.Now()
				// resp, err := http.Get(fmt.Sprintf("http://%s", session.hostname))
				// latency = float64(time.Since(start).Milliseconds())
				// if err != nil { status = "DOWN"; errStr = err.Error() }

				report := &pb.UptimeReport{
					Timestamp: time.Now().Unix(),
					Status:    status,
					LatencyMs: float32(latency),
					CheckType: "HTTP",
					Target:    session.hostname,
					Error:     errStr,
				}

				// Store report
				var reports []*pb.UptimeReport
				if val, ok := s.uptimeReports.Load(agentID); ok {
					reports = val.([]*pb.UptimeReport)
				}
				reports = append([]*pb.UptimeReport{report}, reports...)
				if len(reports) > 50 {
					reports = reports[:50]
				}
				s.uptimeReports.Store(agentID, reports)

				return true
			})
		}
	}()
}

func (s *server) startRecommendationConsumer() {
	if s.config == nil || !s.config.LLM.Enabled {
		log.Println("AI Engine disabled, skipping recommendation consumer")
		return
	}

	go func() {
		brokers := os.Getenv("KAFKA_BROKERS")
		if brokers == "" {
			brokers = "redpanda:9092"
		}
		r := kafka.NewReader(kafka.ReaderConfig{
			Brokers:  []string{brokers},
			Topic:    "optimization-recommendations",
			GroupID:  "gateway-recommendation-consumer",
			MinBytes: 10e3, // 10KB
			MaxBytes: 10e6, // 10MB
		})

		log.Printf("Started consuming recommendations from Kafka (%s)", brokers)

		for {
			m, err := r.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading recommendation: %v", err)
				time.Sleep(5 * time.Second) // backoff
				continue
			}

			var rec pb.Recommendation
			if err := json.Unmarshal(m.Value, &rec); err != nil {
				log.Printf("Error unmarshalling recommendation: %v", err)
				continue
			}

			s.recMu.Lock()
			// Insert at beginning (newest first)
			s.recommendations = append([]*pb.Recommendation{&rec}, s.recommendations...)
			// Limit to 50
			if len(s.recommendations) > 50 {
				s.recommendations = s.recommendations[:50]
			}
			s.recMu.Unlock()

			log.Printf("Received recommendation: %s", rec.Title)
		}
	}()
}

func (srv *server) startBackgroundPruning() {
	go func() {
		// Prune more frequently (every 12 hours) to keep it clean
		ticker := time.NewTicker(12 * time.Hour)
		defer ticker.Stop()

		// Retention is now 10 days for offline agents
		retentionPeriod := 10 * 24 * time.Hour

		prune := func() {
			ids, err := srv.db.PruneStaleAgents(retentionPeriod)
			if err != nil {
				log.Printf("Failed to prune stale agents: %v", err)
				return
			}
			if len(ids) > 0 {
				log.Printf("Pruned %d stale agents (offline > 10 days): %v", len(ids), ids)

				// Cleanup ClickHouse data for these agents
				if srv.clickhouse != nil {
					for _, id := range ids {
						if err := srv.clickhouse.DeleteAgentData(id); err != nil {
							log.Printf("Failed to cleanup ClickHouse data for pruned agent %s: %v", id, err)
						} else {
							log.Printf("Cleaned up ClickHouse analytics for pruned agent %s", id)
						}
					}
				}
			}
		}

		// Run once at startup
		prune()

		for range ticker.C {
			prune()
		}
	}()
}

var (
	configFile  = flag.String("config", "gateway.yaml", "Path to configuration file")
	versionFlag = flag.Bool("version", false, "Display version and exit")
)

var (
	Version   = "0.0.1-dev"
	BuildDate = "unknown"
	GitCommit = "unknown"
)

func main() {
	flag.Parse()
	if *versionFlag {
		fmt.Printf("NGINX Gateway v%s (%s) [%s]\n", Version, BuildDate, GitCommit)
		os.Exit(0)
	}

	cfg, err := config.LoadConfig(*configFile)
	if err != nil {
		log.Printf("Failed to load config: %v", err)
	}

	// Structured logging: default info, level/format configurable via LOG_LEVEL and LOG_FORMAT
	level, format := cfg.LogLevel, cfg.LogFormat
	if level == "" {
		level = "info"
	}
	if format == "" {
		format = "json"
	}
	logging.Setup(&logging.Config{
		Level:   level,
		Format:  format,
		Service: "gateway",
		Version: Version,
	})
	gatewayLog = logging.NewLogger("gateway")

	// Log startup configuration
	gatewayLog.Info().
		Str("version", Version).
		Str("grpc", cfg.GetGRPCAddress()).
		Str("http", cfg.GetHTTPAddress()).
		Msg("Starting NGINX Gateway")

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	// Connect to DB with retries
	db, err := connectToDatabase(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	gatewayLog.Info().Msg("Connected to PostgreSQL database")

	// Connect to ClickHouse
	chDB, err := connectToClickHouse(cfg)
	if err != nil {
		gatewayLog.Warn().Err(err).Msg("ClickHouse not available; analytics will be in-memory only")
	} else {
		gatewayLog.Info().Msg("Connected to ClickHouse database")
	}

	// Kafka configuration
	os.Setenv("KAFKA_BROKERS", cfg.Kafka.Brokers)

	// Initialize PSK Manager for agent authentication
	timestampWindow := 5 * time.Minute
	if cfg.PSK.TimestampWindow != "" {
		if d, err := time.ParseDuration(cfg.PSK.TimestampWindow); err == nil {
			timestampWindow = d
		}
	}
	pskManager := middleware.NewPSKManager(middleware.PSKConfig{
		Enabled:          cfg.PSK.Enabled,
		Key:              cfg.PSK.Key,
		AllowAutoEnroll:  cfg.PSK.AllowAutoEnroll,
		TimestampWindow:  timestampWindow,
		RequireHostMatch: cfg.PSK.RequireHostMatch,
	})

	// Create gRPC server with options
	grpcOpts := []grpc.ServerOption{
		grpc.MaxRecvMsgSize(16 * 1024 * 1024), // 16MB
		grpc.MaxSendMsgSize(16 * 1024 * 1024),
	}

	// Add TLS/mTLS if enabled
	if cfg.Security.EnableTLS {
		tlsConfig, err := loadServerTLSConfig(cfg)
		if err != nil {
			log.Fatalf("Failed to load TLS configuration: %v", err)
		}
		grpcOpts = append(grpcOpts, grpc.Creds(credentials.NewTLS(tlsConfig)))
		log.Printf("TLS enabled for gRPC (mTLS: %v)", cfg.Security.RequireClientCert)
	}

	// Add PSK interceptors if enabled
	if cfg.PSK.Enabled {
		grpcOpts = append(grpcOpts,
			grpc.UnaryInterceptor(pskManager.UnaryPSKInterceptor()),
			grpc.StreamInterceptor(pskManager.StreamPSKInterceptor()),
		)
		log.Printf("PSK authentication enabled for agent connections")
	}
	s := grpc.NewServer(grpcOpts...)

	// Initialize server
	srv := &server{
		recommendations: []*pb.Recommendation{},
		db:              db,
		clickhouse:      chDB,
		analytics: &AnalyticsCache{
			StatusCodes:    make(map[string]int64),
			EndpointStats:  make(map[string]*EndpointStats),
			RequestHistory: []*pb.TimeSeriesPoint{},
		},
		config:     cfg,
		alerts:     NewAlertEngine(db, chDB, cfg),
		pskManager: pskManager,
	}

	// Initialize AI Error Analysis (LLM-powered)
	if cfg.LLM.Enabled && chDB != nil {
		llmConfig := LoadLLMConfigFromConfig(&cfg.LLM)
		// Prefer DB-backed config if available
		if srv.db != nil {
			if dbLLM, err := srv.db.GetActiveLLMClientConfig(context.Background()); err == nil && dbLLM != nil {
				llmConfig = dbLLM
			}
		}
		llmClient, err := NewLLMClient(llmConfig)
		if err != nil {
			log.Printf("Warning: Failed to initialize LLM client: %v (AI recommendations disabled)", err)
		} else {
			log.Printf("LLM client initialized: provider=%s model=%s", llmClient.GetProviderName(), llmClient.GetModelName())
			srv.errorAnalysisAPI = NewErrorAnalysisAPI(chDB, llmClient)
			log.Printf("AI Error Analysis API initialized")
		}
	} else if !cfg.LLM.Enabled {
		log.Printf("LLM/AI error analysis disabled (set llm.enabled=true in config to enable)")
	}
	// Load agents from DB
	if err := srv.db.LoadAgents(&srv.sessions); err != nil {
		log.Printf("Failed to load agents from DB: %v", err)
	} else {
		count := 0
		srv.sessions.Range(func(k, v interface{}) bool {
			count++
			return true
		})
		log.Printf("Loaded %d agents from database", count)
	}

	// Start background services
	srv.startUptimeCrawler()
	if cfg.LLM.Enabled {
		srv.startRecommendationConsumer()
	}
	srv.startBackgroundPruning()
	srv.startGatewayMonitoring()
	srv.alerts.Start()

	// Start HTTP/WebSocket server
	httpServer := srv.createHTTPServer(cfg)
	go func() {
		if cfg.Security.EnableTLS {
			log.Printf("HTTPS/WebSocket server listening on %s", cfg.GetHTTPAddress())
			if err := httpServer.ListenAndServeTLS(cfg.Security.TLSCertFile, cfg.Security.TLSKeyFile); err != nil && err != http.ErrServerClosed {
				log.Printf("HTTPS server error: %v", err)
			}
		} else {
			log.Printf("HTTP/WebSocket server listening on %s", cfg.GetHTTPAddress())
			if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("HTTP server error: %v", err)
			}
		}
	}()

	// Start gRPC server
	lis, err := net.Listen("tcp", cfg.GetGRPCAddress())
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", cfg.GetGRPCAddress(), err)
	}

	pb.RegisterCommanderServer(s, srv)
	pb.RegisterAgentServiceServer(s, srv)

	// Run gRPC server in goroutine
	go func() {
		log.Printf("gRPC server listening on %s", cfg.GetGRPCAddress())
		if err := s.Serve(lis); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	sig := <-sigChan
	log.Printf("Received signal %v, initiating graceful shutdown...", sig)

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(ctx, cfg.Security.ShutdownTimeout)
	defer shutdownCancel()

	// Shutdown HTTP server
	log.Println("Shutting down HTTP server...")
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	// Gracefully stop gRPC server
	log.Println("Shutting down gRPC server...")
	stopped := make(chan struct{})
	go func() {
		s.GracefulStop()
		close(stopped)
	}()

	select {
	case <-stopped:
		log.Println("gRPC server stopped gracefully")
	case <-shutdownCtx.Done():
		log.Println("Shutdown timeout, forcing gRPC stop")
		s.Stop()
	}

	// Stop alert engine
	srv.alerts.Stop()

	log.Println("Gateway shutdown complete")
}

// connectToDatabase connects to PostgreSQL with retries
func connectToDatabase(cfg *config.Config) (*DB, error) {
	var db *DB
	var err error

	for i := 0; i < cfg.Database.MaxRetries; i++ {
		db, err = NewDB(cfg.Database.DSN)
		if err == nil {
			return db, nil
		}
		log.Printf("Database connection attempt %d/%d failed: %v", i+1, cfg.Database.MaxRetries, err)
		time.Sleep(cfg.Database.RetryInterval)
	}

	// Try fallback using DB_DSN environment variable
	fallbackDSN := os.Getenv("DB_DSN")
	if fallbackDSN != "" {
		log.Println("Trying fallback database connection from DB_DSN...")
		db, err = NewDB(fallbackDSN)
		if err == nil {
			return db, nil
		}
	}
	return nil, fmt.Errorf("all connection attempts failed: %w", err)
}

// connectToClickHouse connects to ClickHouse with fallback
func connectToClickHouse(cfg *config.Config) (*ClickHouseDB, error) {
	chDB, err := NewClickHouseDB(
		cfg.ClickHouse.Address,
		cfg.ClickHouse.Username,
		cfg.ClickHouse.Password,
	)
	if err != nil {
		// Try fallback with same credentials
		chDB, err = NewClickHouseDB("127.0.0.1:9000", cfg.ClickHouse.Username, cfg.ClickHouse.Password)
		if err != nil {
			return nil, err
		}
	}
	return chDB, nil
}

// createHTTPServer creates the HTTP server for WebSocket and reports
func (srv *server) createHTTPServer(cfg *config.Config) *http.Server {
	mux := http.NewServeMux()

	// Initialize rate limiter
	rateLimiter := middleware.NewRateLimiter(cfg.Security.RateLimitRPS, cfg.Security.RateLimitBurst)

	// Initialize auth manager
	tokenExpiry := 24 * time.Hour
	if cfg.Auth.TokenExpiry != "" {
		if d, err := time.ParseDuration(cfg.Auth.TokenExpiry); err == nil {
			tokenExpiry = d
		}
	}

	// Set up user lookup function for multi-user auth from database
	// Default users (admin/admin, superuser/superuser) are created by SQL migrations
	var userLookup middleware.UserLookupFunc
	if srv.db != nil {
		userLookup = func(username string) (passwordHash string, role string, found bool) {
			user, err := srv.db.GetUser(username)
			if err != nil || user == nil {
				return "", "", false
			}
			return user.PasswordHash, user.Role, true
		}
	}

	// Fallback password hash for single-user mode (if DB not available)
	passwordHash := cfg.Auth.PasswordHash
	if passwordHash == "" {
		passwordHash = middleware.HashPassword("admin")
	}

	authManager := middleware.NewAuthManager(middleware.AuthConfig{
		Enabled:      cfg.Auth.Enabled,
		Username:     cfg.Auth.Username,
		PasswordHash: passwordHash,
		JWTSecret:    cfg.Auth.JWTSecret,
		TokenExpiry:  tokenExpiry,
		CookieName:   "avika_session",
		CookieSecure: cfg.Auth.CookieSecure,
		CookieDomain: cfg.Auth.CookieDomain,
		UserLookup:   userLookup,
	})

	// Public paths that don't require authentication
	publicPaths := []string{
		"/health",
		"/ready",
		"/metrics",
		"/api/auth/login",
		"/api/auth/logout",
	}

	// Callback to persist password changes to database
	onPasswordChanged := func(username, newHash string) error {
		if srv.db != nil {
			return srv.db.UpdateUserPassword(username, newHash)
		}
		return nil
	}

	// Auth endpoints (always available)
	mux.HandleFunc("/api/auth/login", authManager.LoginHandler())
	mux.HandleFunc("/api/auth/logout", authManager.LogoutHandler())
	mux.HandleFunc("/api/auth/me", authManager.MeHandler())

	// Change password requires authentication
	mux.Handle("/api/auth/change-password", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(authManager.ChangePasswordHandler(onPasswordChanged))))

	// OIDC SSO endpoints
	if cfg.OIDC.Enabled {
		oidcProvider, err := middleware.NewOIDCProvider(
			middleware.OIDCConfig{
				Enabled:       cfg.OIDC.Enabled,
				ProviderURL:   cfg.OIDC.ProviderURL,
				ClientID:      cfg.OIDC.ClientID,
				ClientSecret:  cfg.OIDC.ClientSecret,
				RedirectURL:   cfg.OIDC.RedirectURL,
				Scopes:        cfg.OIDC.Scopes,
				GroupsClaim:   cfg.OIDC.GroupsClaim,
				GroupMapping:  cfg.OIDC.GroupMapping,
				DefaultRole:   cfg.OIDC.DefaultRole,
				AutoProvision: cfg.OIDC.AutoProvision,
			},
			authManager,
			srv.db, // implements UserProvisioner
			srv.db, // implements TeamMapper
		)
		if err != nil {
			log.Printf("Warning: Failed to initialize OIDC provider: %v", err)
		} else {
			mux.HandleFunc("/api/auth/oidc/login", oidcProvider.InitHandler())
			mux.HandleFunc("/api/auth/oidc/callback", oidcProvider.CallbackHandler())
			mux.HandleFunc("/api/auth/oidc/status", oidcProvider.StatusHandler())
			log.Printf("OIDC SSO enabled with provider: %s", cfg.OIDC.ProviderURL)
		}
	}

	// LDAP SSO endpoints
	if cfg.LDAP.Enabled {
		ldapProvider, err := middleware.NewLDAPProvider(
			middleware.LDAPConfig{
				Enabled:       cfg.LDAP.Enabled,
				URL:           cfg.LDAP.URL,
				BindDN:        cfg.LDAP.BindDN,
				BindPassword:  cfg.LDAP.BindPassword,
				BaseDN:        cfg.LDAP.BaseDN,
				UserFilter:    cfg.LDAP.UserFilter,
				GroupFilter:   cfg.LDAP.GroupFilter,
				GroupMapping:  cfg.LDAP.GroupMapping,
				DefaultRole:   cfg.LDAP.DefaultRole,
				AutoProvision: cfg.LDAP.AutoProvision,
			},
			authManager,
			srv.db, // implements UserProvisioner
			srv.db, // implements TeamMapper
		)
		if err != nil {
			log.Printf("Warning: Failed to initialize LDAP provider: %v", err)
		} else {
			mux.HandleFunc("/api/auth/ldap/login", ldapProvider.LoginHandler())
		}
	}

	// SAML SSO endpoints
	if cfg.SAML.Enabled {
		samlProvider, err := middleware.NewSAMLProvider(
			middleware.SAMLConfig{
				Enabled:        cfg.SAML.Enabled,
				IdPMetadataURL: cfg.SAML.IdPMetadataURL,
				EntityID:       cfg.SAML.EntityID,
				RootURL:        cfg.SAML.RootURL,
				CertFile:       cfg.SAML.CertFile,
				KeyFile:        cfg.SAML.KeyFile,
				GroupsClaim:    cfg.SAML.GroupsClaim,
				GroupMapping:   cfg.SAML.GroupMapping,
				DefaultRole:    cfg.SAML.DefaultRole,
				AutoProvision:  cfg.SAML.AutoProvision,
			},
			authManager,
			srv.db, // implements UserProvisioner
			srv.db, // implements TeamMapper
		)
		if err != nil {
			log.Printf("Warning: Failed to initialize SAML provider: %v", err)
		} else {
			mux.Handle("/saml/", samlProvider.HTTPHandlers())
		}
	}

	// OIDC status endpoint (always available so frontend knows if SSO is enabled)
	mux.HandleFunc("/api/auth/sso-config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"oidc_enabled": cfg.OIDC.Enabled,
			"ldap_enabled": cfg.LDAP.Enabled,
			"saml_enabled": cfg.SAML.Enabled,
		})
	})

	if cfg.Auth.Enabled {
		log.Printf("Authentication enabled for user: %s", cfg.Auth.Username)
	} else {
		log.Printf("Authentication disabled - all endpoints are public")
	}

	// WebSocket upgrader with origin validation
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // Allow requests without Origin (e.g., curl)
			}
			for _, allowed := range cfg.Security.AllowedOrigins {
				if allowed == "*" || origin == allowed {
					return true
				}
			}
			log.Printf("Rejected WebSocket connection from origin: %s", origin)
			return false
		},
	}

	// CVE Scanning API
	mux.Handle("GET /api/cve/nginx/{version}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetNginxCVEs)))

	// Terminal (WebSocket) - Now using token-based auth
	mux.Handle("GET /terminal", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		srv.handleTerminal(w, r, upgrader)
	})))

	// Export report endpoint with rate limiting and auth
	mux.Handle("/export-report", authManager.AuthMiddleware(publicPaths)(middleware.RateLimitMiddleware(rateLimiter, cfg.Security.EnableRateLimit)(http.HandlerFunc(srv.handleExportReport))))

	// Geo API endpoint
	mux.Handle("/api/geo", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGeoData)))

	// Visitor analytics API (shape expected by frontend)
	mux.Handle("/api/visitor-analytics", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleVisitorAnalytics)))

	// ============================================================================
	// RBAC / Multi-Tenancy API Endpoints
	// ============================================================================

	// Projects API
	mux.Handle("GET /api/projects", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListProjects)))
	mux.Handle("POST /api/projects", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCreateProject)))
	mux.Handle("GET /api/projects/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetProject)))
	mux.Handle("PUT /api/projects/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateProject)))
	mux.Handle("DELETE /api/projects/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleDeleteProject)))

	// Environments API
	mux.Handle("GET /api/projects/{id}/environments", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListEnvironments)))
	mux.Handle("GET /api/projects/{id}/groups", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListProjectGroups)))
	mux.Handle("POST /api/projects/{id}/environments", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCreateEnvironment)))
	mux.Handle("PUT /api/environments/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateEnvironment)))
	mux.Handle("DELETE /api/environments/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleDeleteEnvironment)))

	// Server Assignment API
	mux.Handle("GET /api/server-assignments", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListServerAssignments)))
	mux.Handle("GET /api/servers/unassigned", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListUnassignedServers)))
	mux.Handle("POST /api/servers/{agentId}/assign", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleAssignServer)))
	mux.Handle("DELETE /api/servers/{agentId}/assign", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUnassignServer)))
	mux.Handle("PUT /api/servers/{agentId}/tags", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateServerTags)))
	mux.Handle("GET /api/servers/{agentId}/drift", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetServerDrift)))
	mux.Handle("GET /api/projects/{id}/drift/compare", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCompareDrift)))
	mux.Handle("GET /api/groups/{id}/logs/stream", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGroupLogsStream)))

	// Agent Runtime Configuration API (agent self-config, persisted on agent)
	mux.Handle("GET /api/agents/{id}/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetAgentRuntimeConfig)))
	mux.Handle("PATCH /api/agents/{id}/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateAgentRuntimeConfig)))
	mux.Handle("GET /api/agents/{id}/config/backups", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListAgentConfigBackups)))
	mux.Handle("POST /api/agents/{id}/config/restore", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleRestoreAgentConfigBackup)))
	mux.Handle("POST /api/agents/{id}/config/test", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleTestAgentConfigConnection)))

	// LLM Configuration (persisted in DB)
	mux.Handle("GET /api/llm/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetLLMConfig)))
	mux.Handle("PUT /api/llm/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handlePutLLMConfig)))
	mux.Handle("POST /api/llm/test", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleTestLLM)))

	// Integrations (persisted in DB)
	mux.Handle("GET /api/integrations", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListIntegrations)))
	mux.Handle("GET /api/integrations/{type}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetIntegration)))
	mux.Handle("PUT /api/integrations/{type}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handlePutIntegration)))
	mux.Handle("POST /api/integrations/{type}/test", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleTestIntegration)))

	// Settings (integrations URLs + display; persisted in DB)
	mux.Handle("GET /api/settings", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetSettings)))
	mux.Handle("POST /api/settings", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handlePostSettings)))

	// Audit Logs API
	mux.Handle("GET /api/audit", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListAuditLogs)))

	// WAF Policies API
	mux.Handle("GET /api/waf/policies", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListWAFPolicies)))
	mux.Handle("POST /api/waf/policies", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCreateWAFPolicy)))
	mux.Handle("GET /api/waf/policies/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetWAFPolicy)))
	mux.Handle("PUT /api/waf/policies/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateWAFPolicy)))

	// Configuration Staging (Fleet Staging)
	mux.Handle("GET /api/staging/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetStagedConfig)))
	mux.Handle("POST /api/staging/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleStageConfig)))
	mux.Handle("DELETE /api/staging/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleDiscardStagedConfig)))

	// Teams API
	mux.Handle("GET /api/teams", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListTeams)))
	mux.Handle("POST /api/teams", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCreateTeam)))
	mux.Handle("GET /api/teams/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGetTeam)))
	mux.Handle("PUT /api/teams/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleUpdateTeam)))
	mux.Handle("DELETE /api/teams/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleDeleteTeam)))

	// Team Members API
	mux.Handle("GET /api/teams/{id}/members", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListTeamMembers)))
	mux.Handle("POST /api/teams/{id}/members", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleAddTeamMember)))
	mux.Handle("DELETE /api/teams/{id}/members/{username}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleRemoveTeamMember)))

	// Team Project Access API
	mux.Handle("GET /api/teams/{id}/projects", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListTeamProjects)))
	mux.Handle("POST /api/teams/{id}/projects", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleGrantProjectAccess)))
	mux.Handle("DELETE /api/teams/{id}/projects/{projectId}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleRevokeProjectAccess)))

	// Enrollment Tokens API
	mux.Handle("GET /api/environments/{id}/enrollment-tokens", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleListEnrollmentTokens)))
	mux.Handle("POST /api/environments/{id}/enrollment-tokens", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleCreateEnrollmentToken)))
	mux.Handle("DELETE /api/enrollment-tokens/{id}", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.handleDeleteEnrollmentToken)))
	mux.HandleFunc("POST /api/enrollment-tokens/validate", srv.handleValidateEnrollmentToken) // No auth - agents use tokens

	// Health check endpoint (no rate limiting)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		pgVer := "unknown"
		chVer := "unknown"

		// Query PG version
		if srv.db != nil && srv.db.conn != nil {
			var v string
			if err := srv.db.conn.QueryRow("SHOW server_version").Scan(&v); err == nil {
				pgVer = v
			}
		}

		// Query ClickHouse version
		if srv.clickhouse != nil && srv.clickhouse.conn != nil {
			var v string
			if err := srv.clickhouse.conn.QueryRow(r.Context(), "SELECT version()").Scan(&v); err == nil {
				chVer = v
			}
		}

		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"healthy","version":"%s","build_date":"%s","git_commit":"%s","postgres_version":"%s","clickhouse_version":"%s"}`, Version, BuildDate, GitCommit, pgVer, chVer)
	})

	// Ready check endpoint (no rate limiting)
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		pgStatus := "connected"
		chStatus := "connected"
		allHealthy := true

		// Check PostgreSQL connectivity
		if err := srv.db.conn.Ping(); err != nil {
			pgStatus = "disconnected"
			allHealthy = false
		}

		// Check ClickHouse connectivity
		var chVersion string = "unknown"
		if srv.clickhouse != nil {
			if err := srv.clickhouse.conn.Ping(r.Context()); err != nil {
				chStatus = "disconnected"
				allHealthy = false
			} else {
				chVersion = srv.clickhouse.GetVersion(r.Context())
			}
		}

		status := "ready"
		httpStatus := http.StatusOK
		if !allHealthy {
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
		}

		pgVersion := srv.db.GetVersion()

		w.WriteHeader(httpStatus)
		fmt.Fprintf(w, `{"status":"%s","database":"%s","database_version":"%s","clickhouse":"%s","clickhouse_version":"%s"}`,
			status, pgStatus, pgVersion, chStatus, chVersion)
	})

	// Prometheus metrics endpoint
	mux.HandleFunc("/metrics", srv.handleMetrics)

	// Agent update distribution endpoint
	// Serves agent binaries and version.json from the updates directory
	updatesDir := cfg.Server.UpdatesDir
	if updatesDir == "" {
		updatesDir = "./updates" // Default directory
	}
	if _, err := os.Stat(updatesDir); err == nil {
		log.Printf("Serving agent updates from %s on /updates/", updatesDir)
		mux.Handle("/updates/", http.StripPrefix("/updates/", http.FileServer(http.Dir(updatesDir))))
	} else {
		log.Printf("Updates directory not found (%s), update serving disabled", updatesDir)
	}

	// AI Error Analysis API (LLM-powered)
	if srv.errorAnalysisAPI != nil {
		mux.Handle("GET /api/v1/errors/analysis", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleGetErrorAnalysis)))
		mux.Handle("GET /api/v1/errors/patterns", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleGetErrorPatterns)))
		mux.Handle("GET /api/v1/errors/trends", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleGetErrorTrend)))
		mux.Handle("GET /api/v1/recommendations", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleGetRecommendations)))
		mux.Handle("GET /api/v1/admin/llm/config", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleGetLLMConfig)))
		mux.Handle("POST /api/v1/admin/llm/test", authManager.AuthMiddleware(publicPaths)(http.HandlerFunc(srv.errorAnalysisAPI.HandleTestLLMConnection)))
		log.Printf("AI Error Analysis API routes registered")
	}
	return &http.Server{
		Addr:         cfg.GetHTTPAddress(),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}

// groupLogEntry pairs a log entry with its source agent_id for merged group log stream
type groupLogEntry struct {
	agentID string
	entry   *pb.LogEntry
}

// handleGroupLogsStream streams merged logs from all agents in a group as SSE (Radar-style).
func (srv *server) handleGroupLogsStream(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("id")
	if groupID == "" {
		http.Error(w, `{"error":"group id required"}`, http.StatusBadRequest)
		return
	}

	resp, err := srv.GetGroupAgents(r.Context(), &pb.GetGroupAgentsRequest{GroupId: groupID})
	if err != nil || resp == nil || len(resp.Agents) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"no agents in group or group not found"}`))
		return
	}

	tailStr := r.URL.Query().Get("tail")
	if tailStr == "" {
		tailStr = "200"
	}
	tail, _ := strconv.Atoi(tailStr)
	if tail <= 0 || tail > 1000 {
		tail = 200
	}
	logType := r.URL.Query().Get("log_type")
	if logType == "" {
		logType = "access"
	}
	follow := r.URL.Query().Get("follow") != "0"

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	sseEvent := func(ev string, data interface{}) {
		payload, _ := json.Marshal(data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev, payload)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
	}

	agentIDs := make([]string, 0, len(resp.Agents))
	for _, a := range resp.Agents {
		agentIDs = append(agentIDs, a.AgentId)
	}
	sseEvent("connected", map[string]interface{}{"group_id": groupID, "agent_ids": agentIDs, "log_type": logType, "tail": tail, "follow": follow})

	mergeCh := make(chan groupLogEntry, 100)
	var cleanup []func()

	for _, agent := range resp.Agents {
		agentID := agent.AgentId
		val, ok := srv.sessions.Load(agentID)
		if !ok {
			continue
		}
		session := val.(*AgentSession)
		session.mu.Lock()
		if session.stream == nil || session.status != "online" {
			session.mu.Unlock()
			continue
		}
		subID := fmt.Sprintf("group-%s-%s-%d", groupID, agentID, time.Now().UnixNano())
		logChan := make(chan *pb.LogEntry, 50)
		session.logChans[subID] = logChan
		stream := session.stream
		session.mu.Unlock()

		cleanup = append(cleanup, func() {
			session.mu.Lock()
			delete(session.logChans, subID)
			session.mu.Unlock()
			close(logChan)
		})

		req := &pb.LogRequest{
			InstanceId: agentID,
			LogType:    logType,
			TailLines:  int32(tail),
			Follow:     follow,
		}
		if err := stream.Send(&pb.ServerCommand{
			CommandId: fmt.Sprintf("log-%s", subID),
			Payload:   &pb.ServerCommand_LogRequest{LogRequest: req},
		}); err != nil {
			continue
		}

		go func(aid string, ch <-chan *pb.LogEntry) {
			for e := range ch {
				select {
				case mergeCh <- groupLogEntry{agentID: aid, entry: e}:
				default:
					// drop if full
				}
			}
		}(agentID, logChan)
	}

	defer func() {
		for _, c := range cleanup {
			c()
		}
	}()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			sseEvent("end", map[string]string{"reason": "client_disconnect"})
			return
		case t, ok := <-mergeCh:
			if !ok {
				sseEvent("end", map[string]string{"reason": "stream_end"})
				return
			}
			payload := map[string]interface{}{
				"agent_id":        t.agentID,
				"timestamp":       t.entry.Timestamp,
				"content":         t.entry.Content,
				"status":          t.entry.Status,
				"log_type":        t.entry.LogType,
				"remote_addr":     t.entry.RemoteAddr,
				"request_method":  t.entry.RequestMethod,
				"request_uri":     t.entry.RequestUri,
				"body_bytes_sent": t.entry.BodyBytesSent,
				"request_time":    t.entry.RequestTime,
				"request_id":      t.entry.RequestId,
				"upstream_addr":   t.entry.UpstreamAddr,
				"upstream_status": t.entry.UpstreamStatus,
				"referer":         t.entry.Referer,
				"user_agent":      t.entry.UserAgent,
			}
			sseEvent("log", payload)
		}
	}
}

// handleTerminal handles WebSocket terminal connections
func (srv *server) handleTerminal(w http.ResponseWriter, r *http.Request, upgrader websocket.Upgrader) {
	agentID := r.URL.Query().Get("agent_id")
	log.Printf("Terminal request for agent: %s", agentID)
	if agentID == "" {
		http.Error(w, "agent_id is required", http.StatusBadRequest)
		return
	}

	// RBAC: Check if user has access to this agent
	user := middleware.GetUserFromContext(r.Context())
	if user != nil {
		visibleAgents, err := srv.db.GetVisibleAgentIDs(user.Username)
		if err != nil {
			log.Printf("Terminal RBAC error for user %s: %v", user.Username, err)
			http.Error(w, "Failed to check access permissions", http.StatusInternalServerError)
			return
		}
		// Check if agentID is in visible agents list
		hasAccess := false
		for _, a := range visibleAgents {
			if a == agentID {
				hasAccess = true
				break
			}
		}
		if !hasAccess {
			log.Printf("Terminal access denied: user %s cannot access agent %s", user.Username, agentID)
			http.Error(w, "Access denied: you don't have permission to access this server", http.StatusForbidden)
			return
		}
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error for agent %s: %v", agentID, err)
		return
	}
	log.Printf("WS upgraded for agent %s", agentID)
	defer ws.Close()

	// Radar-style structured errors: send JSON { type: "error", error: "...", code: "..." } so frontend can show clear message
	writeExecError := func(code, msg string) {
		payload := fmt.Sprintf(`{"type":"error","error":%q,"code":%q}`, msg, code)
		ws.WriteMessage(websocket.TextMessage, []byte(payload))
	}

	client, conn, err := srv.getAgentClient(agentID)
	if err != nil {
		log.Printf("Terminal error: agent %s client failed: %v", agentID, err)
		writeExecError("agent_not_found", fmt.Sprintf("Agent unavailable: %v", err))
		return
	}
	defer func() {
		log.Printf("Closing gRPC connection for terminal session %s", agentID)
		conn.Close()
	}()

	sessionCtx, sessionCancel := context.WithCancel(context.Background())
	defer sessionCancel()

	stream, err := client.Execute(sessionCtx)
	if err != nil {
		log.Printf("Terminal error: exec stream failed for %s: %v", agentID, err)
		writeExecError("stream_failed", fmt.Sprintf("Exec stream failed: %v", err))
		return
	}
	log.Printf("Exec stream established for agent %s", agentID)

	cmd := r.URL.Query().Get("command")
	if err := stream.Send(&pb.ExecRequest{
		InstanceId: agentID,
		Command:    cmd,
	}); err != nil {
		log.Printf("Terminal error: failed to send initial request to %s: %v", agentID, err)
		writeExecError("init_failed", fmt.Sprintf("Failed to start shell: %v", err))
		return
	}
	log.Printf("Initial exec request sent for agent %s (cmd: %s)", agentID, cmd)

	// WS -> gRPC
	go func() {
		defer sessionCancel()
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				log.Printf("WS read error for agent %s: %v", agentID, err)
				return
			}
			if err := stream.Send(&pb.ExecRequest{Input: msg}); err != nil {
				log.Printf("gRPC send error for agent %s: %v", agentID, err)
				return
			}
		}
	}()

	// gRPC -> WS
	log.Printf("Starting gRPC -> WS proxy for agent %s", agentID)
	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			log.Printf("gRPC stream closed (EOF) for %s", agentID)
			break
		}
		if err != nil {
			log.Printf("gRPC recv error for agent %s: %v", agentID, err)
			writeExecError("stream_error", err.Error())
			break
		}
		if len(resp.Output) > 0 {
			if err := ws.WriteMessage(websocket.BinaryMessage, resp.Output); err != nil {
				log.Printf("WS write error for agent %s: %v", agentID, err)
				break
			}
		}
		if resp.Error != "" {
			log.Printf("Exec error reported by agent %s: %s", agentID, resp.Error)
			code := "agent_error"
			if strings.Contains(strings.ToLower(resp.Error), "shell") || strings.Contains(strings.ToLower(resp.Error), "not found") {
				code = "shell_not_found"
			}
			writeExecError(code, resp.Error)
			break
		}
	}
	log.Printf("Terminal session ended for agent %s", agentID)
}

// handleExportReport handles PDF report export requests
func (srv *server) handleExportReport(w http.ResponseWriter, r *http.Request) {
	startUnix, _ := strconv.ParseInt(r.URL.Query().Get("start"), 10, 64)
	endUnix, _ := strconv.ParseInt(r.URL.Query().Get("end"), 10, 64)
	agentIDs := r.URL.Query()["agent_ids"]

	if startUnix == 0 {
		startUnix = time.Now().Add(-24 * time.Hour).Unix()
	}
	if endUnix == 0 {
		endUnix = time.Now().Unix()
	}

	// RBAC: Filter agent IDs to only those the user can access
	user := middleware.GetUserFromContext(r.Context())
	if user != nil {
		visibleAgents, err := srv.db.GetVisibleAgentIDs(user.Username)
		if err != nil {
			log.Printf("Export report RBAC error for user %s: %v", user.Username, err)
			http.Error(w, "Failed to check access permissions", http.StatusInternalServerError)
			return
		}
		// Build set of visible agents for fast lookup
		visibleSet := make(map[string]bool)
		for _, a := range visibleAgents {
			visibleSet[a] = true
		}
		// Filter requested agent IDs
		if len(agentIDs) > 0 {
			filteredIDs := make([]string, 0, len(agentIDs))
			for _, id := range agentIDs {
				if visibleSet[id] {
					filteredIDs = append(filteredIDs, id)
				}
			}
			agentIDs = filteredIDs
		} else {
			// No specific agents requested, use all visible agents
			agentIDs = visibleAgents
		}
	}

	ctx := context.Background()
	if srv.clickhouse == nil {
		http.Error(w, "ClickHouse connection not available", http.StatusServiceUnavailable)
		return
	}

	report, err := srv.clickhouse.GetReportData(ctx, time.Unix(startUnix, 0), time.Unix(endUnix, 0), agentIDs)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to generate report data: %v", err), http.StatusInternalServerError)
		return
	}

	pdfData, err := GeneratePDFReport(report, time.Unix(startUnix, 0), time.Unix(endUnix, 0))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to generate PDF: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=nginx-report-%d.pdf", time.Now().Unix()))
	w.Write(pdfData)
}

// handleMetrics exposes Prometheus-format metrics
func (srv *server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	// Count connected agents
	onlineCount := 0
	offlineCount := 0
	srv.sessions.Range(func(k, v interface{}) bool {
		session := v.(*AgentSession)
		if session.status == "online" {
			onlineCount++
		} else {
			offlineCount++
		}
		return true
	})

	// Get atomic counters
	msgCount := atomic.LoadInt64(&srv.messageCount)
	dbLatSum := atomic.LoadInt64(&srv.dbLatencySum)
	dbOps := atomic.LoadInt64(&srv.dbOpCount)

	avgDbLatency := float64(0)
	if dbOps > 0 {
		avgDbLatency = float64(dbLatSum) / float64(dbOps) / 1e6 // Convert ns to ms
	}

	// Runtime stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Write metrics in Prometheus format
	fmt.Fprintf(w, "# HELP nginx_gateway_info Gateway version information\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_info gauge\n")
	fmt.Fprintf(w, "nginx_gateway_info{version=\"%s\",build_date=\"%s\",git_commit=\"%s\"} 1\n", Version, BuildDate, GitCommit)

	fmt.Fprintf(w, "# HELP nginx_gateway_agents_total Total number of registered agents\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_agents_total gauge\n")
	fmt.Fprintf(w, "nginx_gateway_agents_total{status=\"online\"} %d\n", onlineCount)
	fmt.Fprintf(w, "nginx_gateway_agents_total{status=\"offline\"} %d\n", offlineCount)

	fmt.Fprintf(w, "# HELP nginx_gateway_messages_total Total messages received from agents\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_messages_total counter\n")
	fmt.Fprintf(w, "nginx_gateway_messages_total %d\n", msgCount)

	fmt.Fprintf(w, "# HELP nginx_gateway_db_operations_total Total database operations\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_db_operations_total counter\n")
	fmt.Fprintf(w, "nginx_gateway_db_operations_total %d\n", dbOps)

	fmt.Fprintf(w, "# HELP nginx_gateway_db_latency_avg_ms Average database latency in milliseconds\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_db_latency_avg_ms gauge\n")
	fmt.Fprintf(w, "nginx_gateway_db_latency_avg_ms %.2f\n", avgDbLatency)

	fmt.Fprintf(w, "# HELP nginx_gateway_goroutines Number of goroutines\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_goroutines gauge\n")
	fmt.Fprintf(w, "nginx_gateway_goroutines %d\n", runtime.NumGoroutine())

	fmt.Fprintf(w, "# HELP nginx_gateway_memory_alloc_bytes Allocated memory in bytes\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_memory_alloc_bytes gauge\n")
	fmt.Fprintf(w, "nginx_gateway_memory_alloc_bytes %d\n", memStats.Alloc)

	fmt.Fprintf(w, "# HELP nginx_gateway_memory_sys_bytes Total memory obtained from system\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_memory_sys_bytes gauge\n")
	fmt.Fprintf(w, "nginx_gateway_memory_sys_bytes %d\n", memStats.Sys)

	fmt.Fprintf(w, "# HELP nginx_gateway_gc_pause_total_ns Total GC pause time in nanoseconds\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_gc_pause_total_ns counter\n")
	fmt.Fprintf(w, "nginx_gateway_gc_pause_total_ns %d\n", memStats.PauseTotalNs)

	// Recommendations count
	srv.recMu.RLock()
	recCount := len(srv.recommendations)
	srv.recMu.RUnlock()

	fmt.Fprintf(w, "# HELP nginx_gateway_recommendations_count Number of pending recommendations\n")
	fmt.Fprintf(w, "# TYPE nginx_gateway_recommendations_count gauge\n")
	fmt.Fprintf(w, "nginx_gateway_recommendations_count %d\n", recCount)
}

// startWebSocketServer is deprecated - use createHTTPServer instead
// Kept for reference only

func (s *server) GetTraces(ctx context.Context, req *pb.TraceRequest) (*pb.TraceList, error) {
	if s.clickhouse == nil {
		return &pb.TraceList{}, nil
	}

	// Project/environment filtering
	var agentFilter []string
	if req.EnvironmentId != "" {
		agents, err := s.db.GetAgentIDsForEnvironment(req.EnvironmentId)
		if err != nil {
			log.Printf("GetTraces: Failed to get agents for environment %s: %v", req.EnvironmentId, err)
		} else {
			agentFilter = agents
		}
	} else if req.ProjectId != "" {
		agents, err := s.db.GetAgentIDsForProject(req.ProjectId)
		if err != nil {
			log.Printf("GetTraces: Failed to get agents for project %s: %v", req.ProjectId, err)
		} else {
			agentFilter = agents
		}
	}

	return s.clickhouse.GetTracesWithFilter(ctx, req, agentFilter)
}

func (s *server) GetTraceDetails(ctx context.Context, req *pb.TraceRequest) (*pb.Trace, error) {
	if s.clickhouse == nil {
		return &pb.Trace{}, fmt.Errorf("clickhouse not configured")
	}
	return s.clickhouse.GetTraceDetails(ctx, req.AgentId, req.TraceId)
}

func (s *server) ListAlertRules(ctx context.Context, req *pb.ListAlertRulesRequest) (*pb.AlertRuleList, error) {
	rules, err := s.db.ListAlertRules()
	if err != nil {
		return nil, err
	}
	return &pb.AlertRuleList{Rules: rules}, nil
}

func (s *server) CreateAlertRule(ctx context.Context, req *pb.AlertRule) (*pb.AlertRule, error) {
	// Validate or generate UUID for ID (database requires uuid type)
	if req.Id == "" {
		req.Id = uuid.New().String()
	} else if _, err := uuid.Parse(req.Id); err != nil {
		// Invalid UUID provided, generate a new one
		req.Id = uuid.New().String()
	}
	if err := s.db.UpsertAlertRule(req); err != nil {
		return nil, err
	}
	return req, nil
}

func (s *server) DeleteAlertRule(ctx context.Context, req *pb.DeleteAlertRuleRequest) (*pb.DeleteAlertRuleResponse, error) {
	if err := s.db.DeleteAlertRule(req.Id); err != nil {
		return &pb.DeleteAlertRuleResponse{Success: false}, err
	}
	return &pb.DeleteAlertRuleResponse{Success: true}, nil
}

// handleGeoData handles the /api/geo endpoint for geo analytics
func (srv *server) handleGeoData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if srv.clickhouse == nil {
		http.Error(w, `{"error":"ClickHouse connection not available"}`, http.StatusServiceUnavailable)
		return
	}

	window := r.URL.Query().Get("window")
	if window == "" {
		window = "24h"
	}

	// Project/environment filtering (explicit filter takes precedence)
	environmentID := r.URL.Query().Get("environment_id")
	projectID := r.URL.Query().Get("project_id")

	var agentFilter []string
	if environmentID != "" {
		// Filter by specific environment
		agents, err := srv.db.GetAgentIDsForEnvironment(environmentID)
		if err != nil {
			log.Printf("Geo data: Failed to get agents for environment %s: %v", environmentID, err)
			http.Error(w, `{"error":"Failed to get agents for environment"}`, http.StatusInternalServerError)
			return
		}
		agentFilter = agents
	} else if projectID != "" {
		// Filter by project (all environments)
		agents, err := srv.db.GetAgentIDsForProject(projectID)
		if err != nil {
			log.Printf("Geo data: Failed to get agents for project %s: %v", projectID, err)
			http.Error(w, `{"error":"Failed to get agents for project"}`, http.StatusInternalServerError)
			return
		}
		agentFilter = agents
	} else {
		// RBAC: Get visible agents for the user to filter geo data
		user := middleware.GetUserFromContext(r.Context())
		if user != nil {
			visibleAgents, err := srv.db.GetVisibleAgentIDs(user.Username)
			if err != nil {
				log.Printf("Geo data RBAC error for user %s: %v", user.Username, err)
				http.Error(w, `{"error":"Failed to check access permissions"}`, http.StatusInternalServerError)
				return
			}
			agentFilter = visibleAgents
		}
	}

	ctx := r.Context()
	geoData, err := srv.clickhouse.GetGeoDataFiltered(ctx, window, agentFilter)
	if err != nil {
		log.Printf("GetGeoData error: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"Failed to get geo data: %v"}`, err), http.StatusInternalServerError)
		return
	}

	data, err := json.Marshal(geoData)
	if err != nil {
		http.Error(w, `{"error":"Failed to marshal response"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// visitorAnalyticsFrontendShape is the JSON shape expected by the frontend visitor analytics page.
type visitorAnalyticsFrontendShape struct {
	Summary          map[string]string        `json:"summary"`
	Browsers         []map[string]interface{} `json:"browsers"`
	OperatingSystems []map[string]interface{} `json:"operating_systems"`
	Referrers        []map[string]interface{} `json:"referrers"`
	NotFound         []map[string]interface{} `json:"not_found"`
	Hourly           []map[string]interface{} `json:"hourly"`
	Devices          map[string]string        `json:"devices"`
	StaticFiles      []map[string]interface{} `json:"static_files"`
	RequestedURLs    []map[string]interface{} `json:"requested_urls"`
	StatusCodes      []map[string]interface{} `json:"status_codes"`
}

func (srv *server) handleVisitorAnalytics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if srv.clickhouse == nil {
		empty := visitorAnalyticsFrontendShape{
			Summary: map[string]string{"unique_visitors": "0", "total_hits": "0", "total_bandwidth": "0", "bot_hits": "0", "human_hits": "0"},
			Devices: map[string]string{"desktop": "0", "mobile": "0", "tablet": "0", "other": "0"},
		}
		data, _ := json.Marshal(empty)
		w.WriteHeader(http.StatusOK)
		w.Write(data)
		return
	}

	timeWindow := r.URL.Query().Get("timeWindow")
	if timeWindow == "" {
		timeWindow = "24h"
	}
	agentID := r.URL.Query().Get("agent_id")
	if agentID == "" {
		agentID = "all"
	}

	ctx := r.Context()
	resp, err := srv.clickhouse.GetVisitorAnalytics(ctx, timeWindow, agentID)
	if err != nil {
		log.Printf("GetVisitorAnalytics error: %v", err)
		empty := visitorAnalyticsFrontendShape{
			Summary: map[string]string{"unique_visitors": "0", "total_hits": "0", "total_bandwidth": "0", "bot_hits": "0", "human_hits": "0"},
			Devices: map[string]string{"desktop": "0", "mobile": "0", "tablet": "0", "other": "0"},
		}
		data, _ := json.Marshal(empty)
		w.WriteHeader(http.StatusOK)
		w.Write(data)
		return
	}

	// Map gateway response to frontend shape (snake_case, string numbers where expected)
	out := visitorAnalyticsFrontendShape{
		Summary: map[string]string{
			"unique_visitors": strconv.FormatUint(resp.Summary.UniqueVisitors, 10),
			"total_hits":      strconv.FormatUint(resp.Summary.TotalHits, 10),
			"total_bandwidth": strconv.FormatUint(resp.Summary.TotalBandwidth, 10),
			"bot_hits":        strconv.FormatUint(resp.Summary.BotHits, 10),
			"human_hits":      strconv.FormatUint(resp.Summary.HumanHits, 10),
		},
		Browsers:         make([]map[string]interface{}, 0, len(resp.Browsers)),
		OperatingSystems: make([]map[string]interface{}, 0, len(resp.OperatingSystems)),
		Referrers:        make([]map[string]interface{}, 0, len(resp.Referrers)),
		NotFound:         make([]map[string]interface{}, 0, len(resp.NotFound)),
		Hourly:           make([]map[string]interface{}, 0, len(resp.HourlyStats)),
		Devices:          map[string]string{"desktop": "0", "mobile": "0", "tablet": "0", "other": "0"},
		StaticFiles:      make([]map[string]interface{}, 0, len(resp.StaticFiles)),
		RequestedURLs:    make([]map[string]interface{}, 0, len(resp.RequestedURLs)),
		StatusCodes:      make([]map[string]interface{}, 0, len(resp.StatusCodes)),
	}

	for _, b := range resp.Browsers {
		out.Browsers = append(out.Browsers, map[string]interface{}{
			"browser":    b.Browser,
			"version":    b.Version,
			"hits":       strconv.FormatUint(b.Hits, 10),
			"visitors":   strconv.FormatUint(b.Visitors, 10),
			"percentage": b.Percentage,
		})
	}
	for _, o := range resp.OperatingSystems {
		out.OperatingSystems = append(out.OperatingSystems, map[string]interface{}{
			"os":         o.OS,
			"version":    o.Version,
			"hits":       strconv.FormatUint(o.Hits, 10),
			"visitors":   strconv.FormatUint(o.Visitors, 10),
			"percentage": o.Percentage,
		})
	}
	for _, ref := range resp.Referrers {
		out.Referrers = append(out.Referrers, map[string]interface{}{
			"referrer":   ref.Domain,
			"hits":       strconv.FormatUint(ref.Hits, 10),
			"visitors":   strconv.FormatUint(ref.Visitors, 10),
			"percentage": ref.Percentage,
		})
	}
	for _, nf := range resp.NotFound {
		out.NotFound = append(out.NotFound, map[string]interface{}{
			"path":      nf.URI,
			"hits":      strconv.FormatUint(nf.Hits, 10),
			"last_seen": strconv.FormatInt(nf.LastSeen, 10),
		})
	}
	for _, h := range resp.HourlyStats {
		out.Hourly = append(out.Hourly, map[string]interface{}{
			"hour":      h.Hour,
			"hits":      strconv.FormatUint(h.Hits, 10),
			"visitors":  strconv.FormatUint(h.Visitors, 10),
			"bandwidth": strconv.FormatUint(h.Bandwidth, 10),
		})
	}
	for _, d := range resp.DeviceTypes {
		key := strings.ToLower(d.DeviceType)
		switch key {
		case "desktop", "mobile", "tablet", "other":
			out.Devices[key] = strconv.FormatUint(d.Hits, 10)
		default:
			n := mustParseUint(out.Devices["other"])
			out.Devices["other"] = strconv.FormatUint(n+d.Hits, 10)
		}
	}
	for _, s := range resp.StaticFiles {
		out.StaticFiles = append(out.StaticFiles, map[string]interface{}{
			"path":      s.URI,
			"hits":      strconv.FormatUint(s.Hits, 10),
			"bandwidth": strconv.FormatUint(s.Bandwidth, 10),
		})
	}
	for _, u := range resp.RequestedURLs {
		out.RequestedURLs = append(out.RequestedURLs, map[string]interface{}{
			"uri":       u.URI,
			"hits":      strconv.FormatUint(u.Hits, 10),
			"bandwidth": strconv.FormatUint(u.Bandwidth, 10),
			"status":   u.Status,
		})
	}
	for _, c := range resp.StatusCodes {
		out.StatusCodes = append(out.StatusCodes, map[string]interface{}{
			"code":       c.Code,
			"hits":       strconv.FormatUint(c.Hits, 10),
			"percentage": c.Percentage,
		})
	}

	data, err := json.Marshal(out)
	if err != nil {
		http.Error(w, `{"error":"Failed to marshal response"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func mustParseUint(s string) uint64 {
	n, _ := strconv.ParseUint(s, 10, 64)
	return n
}

// autoAssignAgentToEnvironment automatically assigns an agent to an environment based on its labels
// Labels like "project" and "environment" are matched against project/environment slugs
func (s *server) autoAssignAgentToEnvironment(agentID string, labels map[string]string) {
	if s.db == nil {
		return
	}

	// Check for project label
	projectSlug, hasProject := labels["project"]
	if !hasProject {
		return
	}

	// Environments are agent-only: only assign when agent sends AVIKA_LABEL_ENVIRONMENT (no default)
	envSlug, hasEnv := labels["environment"]
	if !hasEnv || envSlug == "" {
		return
	}

	// Find project by slug
	project, err := s.db.GetProjectBySlug(projectSlug)
	if err != nil || project == nil {
		log.Printf("Auto-assign: project '%s' not found for agent %s", projectSlug, agentID)
		return
	}

	// Find or create environment by project and slug (environments driven by agent config)
	env, err := s.db.EnsureEnvironment(project.ID, envSlug)
	if err != nil || env == nil {
		log.Printf("Auto-assign: failed to ensure environment '%s' in project '%s' for agent %s: %v", envSlug, projectSlug, agentID, err)
		return
	}

	// Check if already assigned
	existing, err := s.db.GetServerAssignment(agentID)
	if err == nil && existing != nil {
		// Already assigned, skip
		log.Printf("Auto-assign: agent %s already assigned to environment %s", agentID, existing.EnvironmentID)
		return
	}

	// Auto-assign to environment
	displayName := ""
	if name, ok := labels["name"]; ok {
		displayName = name
	}
	_, err = s.db.AssignServer(agentID, env.ID, displayName, "", nil) // Empty string for auto-assignment
	if err != nil {
		log.Printf("Auto-assign failed for agent %s: %v", agentID, err)
		return
	}

	log.Printf("Auto-assigned agent %s to project '%s', environment '%s'", agentID, project.Name, env.Name)
}

func loadServerTLSConfig(cfg *config.Config) (*tls.Config, error) {
	// Load server certificate and key
	cert, err := tls.LoadX509KeyPair(cfg.Security.TLSCertFile, cfg.Security.TLSKeyFile)
	if err != nil {
		return nil, fmt.Errorf("could not load server key pair: %s", err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}

	// Add client CA if mTLS is required
	if cfg.Security.RequireClientCert {
		if cfg.Security.TLSCACertFile == "" {
			return nil, fmt.Errorf("mTLS required but tls_ca_cert_file is empty")
		}

		caCert, err := os.ReadFile(cfg.Security.TLSCACertFile)
		if err != nil {
			return nil, fmt.Errorf("could not read client CA cert: %s", err)
		}

		certPool := x509.NewCertPool()
		if ok := certPool.AppendCertsFromPEM(caCert); !ok {
			return nil, fmt.Errorf("failed to append client CA cert")
		}

		tlsConfig.ClientCAs = certPool
		tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	}

	return tlsConfig, nil
}
