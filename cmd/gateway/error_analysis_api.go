package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// ErrorAnalysisAPI handles error analysis endpoints
type ErrorAnalysisAPI struct {
	db         *ClickHouseDB
	classifier *ErrorClassifier
	recEngine  *RecommendationEngine
	llmClient  LLMClient
}

// NewErrorAnalysisAPI creates a new error analysis API handler
func NewErrorAnalysisAPI(db *ClickHouseDB, llmClient LLMClient) *ErrorAnalysisAPI {
	classifier := NewErrorClassifier()
	recEngine := NewRecommendationEngine(db, llmClient)

	return &ErrorAnalysisAPI{
		db:         db,
		classifier: classifier,
		recEngine:  recEngine,
		llmClient:  llmClient,
	}
}

func (api *ErrorAnalysisAPI) SetLLMClient(llmClient LLMClient) {
	api.llmClient = llmClient
	if api.recEngine != nil {
		api.recEngine.SetLLMClient(llmClient)
	}
}

// ErrorAnalysisResponse is the API response for error analysis
type ErrorAnalysisResponse struct {
	Summary           *ErrorSummary       `json:"summary"`
	Patterns          []*ErrorPattern     `json:"patterns"`
	Trend             []ErrorTrendPoint   `json:"trend"`
	TopErrorEndpoints []EndpointErrorStat `json:"top_error_endpoints"`
	AIAnalysis        *AnalysisResponse   `json:"ai_analysis,omitempty"`
	Recommendations   []*AIRecommendation `json:"recommendations,omitempty"`
	GeneratedAt       int64               `json:"generated_at"`
}

// ErrorSummary provides high-level error statistics
type ErrorSummary struct {
	TotalErrors          int64            `json:"total_errors"`
	TotalRequests        int64            `json:"total_requests"`
	ErrorRate            float64          `json:"error_rate"`
	ErrorRateDelta       float64          `json:"error_rate_delta"`
	ErrorsByStatus       map[string]int64 `json:"errors_by_status"`
	ErrorsByCategory     map[string]int64 `json:"errors_by_category"`
	MostAffectedEndpoint string           `json:"most_affected_endpoint"`
	PrimaryRootCause     string           `json:"primary_root_cause"`
}

// ErrorTrendPoint represents error counts at a point in time
type ErrorTrendPoint struct {
	Time      string `json:"time"`
	Errors4xx int64  `json:"errors_4xx"`
	Errors5xx int64  `json:"errors_5xx"`
	Errors499 int64  `json:"errors_499"`
	Total     int64  `json:"total"`
}

// EndpointErrorStat shows error statistics for an endpoint
type EndpointErrorStat struct {
	URI         string  `json:"uri"`
	Method      string  `json:"method"`
	TotalErrors int64   `json:"total_errors"`
	ErrorRate   float64 `json:"error_rate"`
	TopStatus   int     `json:"top_status"`
	AvgLatency  float32 `json:"avg_latency"`
	P95Latency  float32 `json:"p95_latency"`
}

// HandleGetErrorAnalysis handles GET /api/v1/errors/analysis
func (api *ErrorAnalysisAPI) HandleGetErrorAnalysis(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse query parameters
	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	agentID := r.URL.Query().Get("agent_id")
	includeAI := r.URL.Query().Get("include_ai") != "false"

	// Calculate time range
	duration := parseDuration(timeWindow)
	startTime := time.Now().Add(-duration)

	// Build response
	response := &ErrorAnalysisResponse{
		GeneratedAt: time.Now().Unix(),
	}

	// Get error summary
	summary, err := api.getErrorSummary(ctx, startTime, agentID)
	if err != nil {
		log.Printf("Error getting summary: %v", err)
	}
	response.Summary = summary

	// Get error patterns
	patterns, err := api.getErrorPatterns(ctx, startTime, agentID)
	if err != nil {
		log.Printf("Error getting patterns: %v", err)
	}
	response.Patterns = patterns

	// Get error trend
	trend, err := api.getErrorTrend(ctx, startTime, duration, agentID)
	if err != nil {
		log.Printf("Error getting trend: %v", err)
	}
	response.Trend = trend

	// Get top error endpoints
	endpoints, err := api.getTopErrorEndpoints(ctx, startTime, agentID)
	if err != nil {
		log.Printf("Error getting endpoints: %v", err)
	}
	response.TopErrorEndpoints = endpoints

	// Generate AI analysis if requested
	if includeAI && api.llmClient != nil {
		analysisCtx := api.buildAnalysisContext(summary, patterns, duration)

		// Get AI analysis
		aiAnalysis, err := api.recEngine.AnalyzeErrors(ctx, analysisCtx)
		if err != nil {
			log.Printf("AI analysis failed: %v", err)
		} else {
			response.AIAnalysis = aiAnalysis
		}

		// Generate recommendations
		recs, err := api.recEngine.GenerateRecommendations(ctx, analysisCtx)
		if err != nil {
			log.Printf("Recommendation generation failed: %v", err)
		} else {
			response.Recommendations = recs
		}
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetRecommendations handles GET /api/v1/recommendations
func (api *ErrorAnalysisAPI) HandleGetRecommendations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	agentID := r.URL.Query().Get("agent_id")
	category := r.URL.Query().Get("category")
	forceRefresh := r.URL.Query().Get("refresh") == "true"

	duration := parseDuration(timeWindow)
	startTime := time.Now().Add(-duration)

	// Build analysis context
	summary, _ := api.getErrorSummary(ctx, startTime, agentID)
	patterns, _ := api.getErrorPatterns(ctx, startTime, agentID)
	analysisCtx := api.buildAnalysisContext(summary, patterns, duration)

	// Generate recommendations
	recs, err := api.recEngine.GenerateRecommendations(ctx, analysisCtx)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to generate recommendations: %v", err), http.StatusInternalServerError)
		return
	}

	// Filter by category if specified
	if category != "" && category != "all" {
		filtered := make([]*AIRecommendation, 0)
		for _, r := range recs {
			if r.Category == category {
				filtered = append(filtered, r)
			}
		}
		recs = filtered
	}

	response := struct {
		Recommendations []*AIRecommendation `json:"recommendations"`
		GeneratedAt     int64               `json:"generated_at"`
		ModelUsed       string              `json:"model_used"`
		FromCache       bool                `json:"from_cache"`
	}{
		Recommendations: recs,
		GeneratedAt:     time.Now().Unix(),
		ModelUsed:       api.llmClient.GetModelName(),
		FromCache:       !forceRefresh,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetErrorPatterns handles GET /api/v1/errors/patterns
func (api *ErrorAnalysisAPI) HandleGetErrorPatterns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	agentID := r.URL.Query().Get("agent_id")
	statusCode := r.URL.Query().Get("status")

	duration := parseDuration(timeWindow)
	startTime := time.Now().Add(-duration)

	patterns, err := api.getErrorPatterns(ctx, startTime, agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get patterns: %v", err), http.StatusInternalServerError)
		return
	}

	// Filter by status if specified
	if statusCode != "" {
		filtered := make([]*ErrorPattern, 0)
		for _, p := range patterns {
			if fmt.Sprintf("%d", p.StatusCode) == statusCode ||
				(statusCode == "4xx" && p.StatusCode >= 400 && p.StatusCode < 500) ||
				(statusCode == "5xx" && p.StatusCode >= 500) {
				filtered = append(filtered, p)
			}
		}
		patterns = filtered
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(patterns)
}

// HandleGetErrorTrend handles GET /api/v1/errors/trends
func (api *ErrorAnalysisAPI) HandleGetErrorTrend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	timeWindow := r.URL.Query().Get("window")
	if timeWindow == "" {
		timeWindow = "24h"
	}

	agentID := r.URL.Query().Get("agent_id")

	duration := parseDuration(timeWindow)
	startTime := time.Now().Add(-duration)

	trend, err := api.getErrorTrend(ctx, startTime, duration, agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get trend: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trend)
}

// HandleGetLLMConfig handles GET /api/v1/admin/llm/config
func (api *ErrorAnalysisAPI) HandleGetLLMConfig(w http.ResponseWriter, r *http.Request) {
	config := struct {
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		Enabled      bool   `json:"enabled"`
		CacheEnabled bool   `json:"cache_enabled"`
	}{
		Provider:     api.llmClient.GetProviderName(),
		Model:        api.llmClient.GetModelName(),
		Enabled:      api.llmClient.GetProviderName() != "mock",
		CacheEnabled: true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// HandleTestLLMConnection handles POST /api/v1/admin/llm/test
func (api *ErrorAnalysisAPI) HandleTestLLMConnection(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	err := api.llmClient.HealthCheck(ctx)

	response := struct {
		Success  bool   `json:"success"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
		Error    string `json:"error,omitempty"`
	}{
		Provider: api.llmClient.GetProviderName(),
		Model:    api.llmClient.GetModelName(),
	}

	if err != nil {
		response.Success = false
		response.Error = err.Error()
	} else {
		response.Success = true
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Database query methods

func (api *ErrorAnalysisAPI) getErrorSummary(ctx context.Context, startTime time.Time, agentID string) (*ErrorSummary, error) {
	summary := &ErrorSummary{
		ErrorsByStatus:   make(map[string]int64),
		ErrorsByCategory: make(map[string]int64),
	}

	whereClause := "WHERE timestamp >= ? AND status >= 400"
	args := []interface{}{startTime}

	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	// Get totals
	query := fmt.Sprintf(`
		SELECT 
			count(*) as total_errors,
			(SELECT count(*) FROM nginx_analytics.access_logs WHERE timestamp >= ?) as total_requests,
			countIf(status >= 400 AND status < 500) as errors_4xx,
			countIf(status >= 500) as errors_5xx,
			countIf(status = 499) as errors_499,
			countIf(status = 502) as errors_502,
			countIf(status = 503) as errors_503,
			countIf(status = 504) as errors_504
		FROM nginx_analytics.access_logs
		%s
	`, whereClause)

	var totalErrors, totalReqs, e4xx, e5xx, e499, e502, e503, e504 uint64
	queryArgs := append([]interface{}{startTime}, args...)

	err := api.db.conn.QueryRow(ctx, query, queryArgs...).Scan(
		&totalErrors, &totalReqs, &e4xx, &e5xx, &e499, &e502, &e503, &e504)
	if err != nil {
		return summary, err
	}

	summary.TotalErrors = int64(totalErrors)
	summary.TotalRequests = int64(totalReqs)
	if totalReqs > 0 {
		summary.ErrorRate = float64(totalErrors) / float64(totalReqs) * 100
	}

	summary.ErrorsByStatus["4xx"] = int64(e4xx)
	summary.ErrorsByStatus["5xx"] = int64(e5xx)
	summary.ErrorsByStatus["499"] = int64(e499)
	summary.ErrorsByStatus["502"] = int64(e502)
	summary.ErrorsByStatus["503"] = int64(e503)
	summary.ErrorsByStatus["504"] = int64(e504)

	// Categorize errors
	if e499 > 0 {
		summary.ErrorsByCategory["client_closed"] = int64(e499)
	}
	if e502 > 0 {
		summary.ErrorsByCategory["bad_gateway"] = int64(e502)
	}
	if e503 > 0 {
		summary.ErrorsByCategory["service_unavailable"] = int64(e503)
	}
	if e504 > 0 {
		summary.ErrorsByCategory["gateway_timeout"] = int64(e504)
	}
	if e4xx-e499 > 0 {
		summary.ErrorsByCategory["client_error"] = int64(e4xx - e499)
	}

	// Get most affected endpoint
	endpointQuery := fmt.Sprintf(`
		SELECT request_uri, count(*) as cnt
		FROM nginx_analytics.access_logs
		%s
		GROUP BY request_uri
		ORDER BY cnt DESC
		LIMIT 1
	`, whereClause)

	var topURI string
	var topCnt uint64
	api.db.conn.QueryRow(ctx, endpointQuery, args...).Scan(&topURI, &topCnt)
	summary.MostAffectedEndpoint = topURI

	// Determine primary root cause
	if e502 > e499 && e502 > e503 && e502 > e504 {
		summary.PrimaryRootCause = "Upstream server unavailability"
	} else if e499 > e503 && e499 > e504 {
		summary.PrimaryRootCause = "Slow backend responses"
	} else if e504 > e503 {
		summary.PrimaryRootCause = "Backend timeout issues"
	} else if e503 > 0 {
		summary.PrimaryRootCause = "Server overload"
	} else {
		summary.PrimaryRootCause = "Client request issues"
	}

	return summary, nil
}

func (api *ErrorAnalysisAPI) getErrorPatterns(ctx context.Context, startTime time.Time, agentID string) ([]*ErrorPattern, error) {
	whereClause := "WHERE timestamp >= ? AND status >= 400"
	args := []interface{}{startTime}

	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	query := fmt.Sprintf(`
		SELECT 
			status,
			request_uri,
			request_method,
			count(*) as cnt,
			min(timestamp) as first_seen,
			max(timestamp) as last_seen,
			avg(request_time) * 1000 as avg_latency,
			max(request_time) * 1000 as max_latency,
			quantile(0.95)(request_time) * 1000 as p95_latency,
			groupUniqArray(10)(instance_id) as agents
		FROM nginx_analytics.access_logs
		%s
		GROUP BY status, request_uri, request_method
		HAVING cnt > 5
		ORDER BY cnt DESC
		LIMIT 50
	`, whereClause)

	rows, err := api.db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var patterns []*ErrorPattern
	for rows.Next() {
		var status uint16
		var uri, method string
		var cnt uint64
		var firstSeen, lastSeen time.Time
		var avgLat, maxLat, p95Lat float64
		var agents []string

		err := rows.Scan(&status, &uri, &method, &cnt, &firstSeen, &lastSeen, &avgLat, &maxLat, &p95Lat, &agents)
		if err != nil {
			continue
		}

		// Get classification
		classification := api.classifier.Classify(&pb.LogEntry{
			Status:        int32(status),
			RequestUri:    uri,
			RequestMethod: method,
		})

		pattern := &ErrorPattern{
			StatusCode:      int(status),
			URIPattern:      normalizeURI(uri),
			Method:          method,
			OccurrenceCount: int64(cnt),
			FirstSeen:       firstSeen,
			LastSeen:        lastSeen,
			AvgLatency:      float32(avgLat),
			MaxLatency:      float32(maxLat),
			P95Latency:      float32(p95Lat),
			AffectedAgents:  agents,
		}

		if classification != nil {
			pattern.Category = classification.Category
			pattern.Severity = classification.Severity
			pattern.RootCauses = classification.RootCauses
			pattern.Fingerprint = GenerateFingerprint(&pb.LogEntry{
				Status:        int32(status),
				RequestUri:    uri,
				RequestMethod: method,
			}).Hash
		}

		patterns = append(patterns, pattern)
	}

	return patterns, nil
}

func (api *ErrorAnalysisAPI) getErrorTrend(ctx context.Context, startTime time.Time, duration time.Duration, agentID string) ([]ErrorTrendPoint, error) {
	// Determine bucket size based on duration
	bucketSize := "toStartOfHour"
	if duration <= 3*time.Hour {
		bucketSize = "toStartOfFiveMinutes"
	} else if duration <= 12*time.Hour {
		bucketSize = "toStartOfFifteenMinutes"
	} else if duration > 7*24*time.Hour {
		bucketSize = "toStartOfDay"
	}

	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}

	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	query := fmt.Sprintf(`
		SELECT 
			formatDateTime(%s(timestamp), '%%Y-%%m-%%d %%H:%%i') as time,
			countIf(status >= 400 AND status < 500) as errors_4xx,
			countIf(status >= 500) as errors_5xx,
			countIf(status = 499) as errors_499,
			countIf(status >= 400) as total
		FROM nginx_analytics.access_logs
		%s
		GROUP BY time
		ORDER BY time
	`, bucketSize, whereClause)

	rows, err := api.db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trend []ErrorTrendPoint
	for rows.Next() {
		var point ErrorTrendPoint
		var e4xx, e5xx, e499, total uint64

		err := rows.Scan(&point.Time, &e4xx, &e5xx, &e499, &total)
		if err != nil {
			continue
		}

		point.Errors4xx = int64(e4xx)
		point.Errors5xx = int64(e5xx)
		point.Errors499 = int64(e499)
		point.Total = int64(total)
		trend = append(trend, point)
	}

	return trend, nil
}

func (api *ErrorAnalysisAPI) getTopErrorEndpoints(ctx context.Context, startTime time.Time, agentID string) ([]EndpointErrorStat, error) {
	whereClause := "WHERE timestamp >= ?"
	args := []interface{}{startTime}

	if agentID != "" && agentID != "all" {
		whereClause += " AND instance_id = ?"
		args = append(args, agentID)
	}

	query := fmt.Sprintf(`
		SELECT 
			request_uri,
			request_method,
			countIf(status >= 400) as error_count,
			count(*) as total_count,
			argMax(status, countIf(status >= 400)) as top_status,
			avg(request_time) * 1000 as avg_latency,
			quantile(0.95)(request_time) * 1000 as p95_latency
		FROM nginx_analytics.access_logs
		%s
		GROUP BY request_uri, request_method
		HAVING error_count > 0
		ORDER BY error_count DESC
		LIMIT 20
	`, whereClause)

	rows, err := api.db.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var endpoints []EndpointErrorStat
	for rows.Next() {
		var stat EndpointErrorStat
		var errorCnt, totalCnt uint64
		var topStatus uint16
		var avgLat, p95Lat float64

		err := rows.Scan(&stat.URI, &stat.Method, &errorCnt, &totalCnt, &topStatus, &avgLat, &p95Lat)
		if err != nil {
			continue
		}

		stat.TotalErrors = int64(errorCnt)
		if totalCnt > 0 {
			stat.ErrorRate = float64(errorCnt) / float64(totalCnt) * 100
		}
		stat.TopStatus = int(topStatus)
		stat.AvgLatency = float32(avgLat)
		stat.P95Latency = float32(p95Lat)
		endpoints = append(endpoints, stat)
	}

	return endpoints, nil
}

func (api *ErrorAnalysisAPI) buildAnalysisContext(summary *ErrorSummary, patterns []*ErrorPattern, duration time.Duration) *ErrorAnalysisContext {
	ctx := &ErrorAnalysisContext{
		TimeWindow:    duration,
		ErrorPatterns: patterns,
		TotalErrors:   summary.TotalErrors,
		TotalRequests: summary.TotalRequests,
		CurrentConfig: &NginxConfigContext{},
	}

	if summary.TotalRequests > 0 {
		ctx.Error4xxRate = float64(summary.ErrorsByStatus["4xx"]) / float64(summary.TotalRequests) * 100
		ctx.Error5xxRate = float64(summary.ErrorsByStatus["5xx"]) / float64(summary.TotalRequests) * 100
		ctx.Error499Rate = float64(summary.ErrorsByStatus["499"]) / float64(summary.TotalRequests) * 100
	}

	ctx.Error502Count = summary.ErrorsByStatus["502"]
	ctx.Error503Count = summary.ErrorsByStatus["503"]
	ctx.Error504Count = summary.ErrorsByStatus["504"]

	// Set default config values (would be read from actual config in production)
	ctx.CurrentConfig = &NginxConfigContext{
		WorkerConnections:   1024,
		ProxyReadTimeout:    60,
		ProxyConnectTimeout: 60,
		ProxySendTimeout:    60,
		KeepaliveTimeout:    65,
	}

	// Calculate average latency from patterns
	var totalLatency float32
	for _, p := range patterns {
		totalLatency += p.AvgLatency
		if p.P95Latency > float32(ctx.P95UpstreamLatency) {
			ctx.P95UpstreamLatency = float64(p.P95Latency)
		}
	}
	if len(patterns) > 0 {
		ctx.AvgUpstreamLatency = float64(totalLatency / float32(len(patterns)))
	}

	return ctx
}

// Helper function to parse duration strings
func parseDuration(window string) time.Duration {
	switch window {
	case "5m":
		return 5 * time.Minute
	case "15m":
		return 15 * time.Minute
	case "30m":
		return 30 * time.Minute
	case "1h":
		return 1 * time.Hour
	case "3h":
		return 3 * time.Hour
	case "6h":
		return 6 * time.Hour
	case "12h":
		return 12 * time.Hour
	case "24h":
		return 24 * time.Hour
	case "2d":
		return 2 * 24 * time.Hour
	case "3d":
		return 3 * 24 * time.Hour
	case "7d":
		return 7 * 24 * time.Hour
	case "30d":
		return 30 * 24 * time.Hour
	default:
		return 24 * time.Hour
	}
}
