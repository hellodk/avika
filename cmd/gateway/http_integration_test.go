//go:build integration

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// setupTestServer creates a test server with real database connection
func setupTestServer(t *testing.T) (*server, *DB) {
	db := setupTestDB(t)

	cfg := &config.Config{
		Server: config.ServerConfig{
			GRPCPort: 5020,
			HTTPPort: 5021,
		},
		Security: config.SecurityConfig{
			AllowedOrigins:  []string{"*"},
			RateLimitRPS:    100,
			RateLimitBurst:  200,
			EnableRateLimit: false,
			ShutdownTimeout: 30 * time.Second,
		},
	}

	srv := &server{
		recommendations: []*pb.Recommendation{},
		db:              db,
		clickhouse:      nil, // No ClickHouse in basic integration tests
		analytics: &AnalyticsCache{
			StatusCodes:    make(map[string]int64),
			EndpointStats:  make(map[string]*EndpointStats),
			RequestHistory: []*pb.TimeSeriesPoint{},
		},
		config: cfg,
	}

	return srv, db
}

func TestHealthEndpointIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()

	httpServer := srv.createHTTPServer(srv.config)
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	httpServer.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got '%s'", resp["status"])
	}
}

func TestReadyEndpointIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()

	httpServer := srv.createHTTPServer(srv.config)
	req := httptest.NewRequest("GET", "/ready", nil)
	w := httptest.NewRecorder()

	httpServer.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 when DB is available, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp["status"] != "ready" {
		t.Errorf("Expected status 'ready', got '%s'", resp["status"])
	}
}

func TestMetricsEndpointIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()

	// Add some test agents to sessions
	testAgent := &AgentSession{
		id:       "test-agent-metrics",
		hostname: "metrics-host",
		status:   "online",
	}
	srv.sessions.Store(testAgent.id, testAgent)

	httpServer := srv.createHTTPServer(srv.config)
	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()

	httpServer.Handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	body := w.Body.String()

	// Verify Prometheus format metrics are present
	expectedMetrics := []string{
		"nginx_gateway_info",
		"nginx_gateway_agents_total",
		"nginx_gateway_messages_total",
		"nginx_gateway_db_operations_total",
		"nginx_gateway_goroutines",
		"nginx_gateway_memory_alloc_bytes",
	}

	for _, metric := range expectedMetrics {
		if !containsString(body, metric) {
			t.Errorf("Expected metric '%s' not found in response", metric)
		}
	}

	// Verify online agent is counted
	if !containsString(body, `nginx_gateway_agents_total{status="online"} 1`) {
		t.Error("Expected 1 online agent in metrics")
	}

	// Cleanup
	srv.sessions.Delete(testAgent.id)
}

func TestListAgentsIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create test agent in DB
	testAgent := &AgentSession{
		id:             "test-agent-list",
		hostname:       "list-test-host",
		version:        "1.25.0",
		agentVersion:   "0.2.0",
		instancesCount: 2,
		uptime:         "1000s",
		ip:             "10.0.0.50",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          false,
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	err := db.UpsertAgent(testAgent)
	if err != nil {
		t.Fatalf("Failed to create test agent: %v", err)
	}

	// Store in sessions map
	srv.sessions.Store(testAgent.id, testAgent)

	// Call ListAgents
	ctx := context.Background()
	resp, err := srv.ListAgents(ctx, &pb.ListAgentsRequest{})
	if err != nil {
		t.Fatalf("ListAgents failed: %v", err)
	}

	// Verify agent is in response
	found := false
	for _, agent := range resp.Agents {
		if agent.AgentId == testAgent.id {
			found = true
			if agent.Hostname != testAgent.hostname {
				t.Errorf("Expected hostname '%s', got '%s'", testAgent.hostname, agent.Hostname)
			}
			if agent.Status != "online" {
				t.Errorf("Expected status 'online', got '%s'", agent.Status)
			}
			break
		}
	}

	if !found {
		t.Error("Test agent not found in ListAgents response")
	}

	// Cleanup
	srv.sessions.Delete(testAgent.id)
}

func TestGetAgentIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()

	// Create and store test agent
	testAgent := &AgentSession{
		id:             "test-agent-get",
		hostname:       "get-test-host",
		version:        "1.24.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "500s",
		ip:             "10.0.0.60",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          true,
		podIP:          "10.244.0.10",
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	srv.sessions.Store(testAgent.id, testAgent)

	// Get agent
	ctx := context.Background()
	agent, err := srv.GetAgent(ctx, &pb.GetAgentRequest{AgentId: testAgent.id})
	if err != nil {
		t.Fatalf("GetAgent failed: %v", err)
	}

	if agent.AgentId != testAgent.id {
		t.Errorf("Expected agent ID '%s', got '%s'", testAgent.id, agent.AgentId)
	}
	if agent.Hostname != testAgent.hostname {
		t.Errorf("Expected hostname '%s', got '%s'", testAgent.hostname, agent.Hostname)
	}
	if !agent.IsPod {
		t.Error("Expected IsPod to be true")
	}
	if agent.PodIp != testAgent.podIP {
		t.Errorf("Expected PodIP '%s', got '%s'", testAgent.podIP, agent.PodIp)
	}

	// Test not found
	_, err = srv.GetAgent(ctx, &pb.GetAgentRequest{AgentId: "nonexistent"})
	if err == nil {
		t.Error("Expected error for nonexistent agent")
	}

	// Cleanup
	srv.sessions.Delete(testAgent.id)
}

func TestRemoveAgentIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create test agent in DB and sessions
	testAgent := &AgentSession{
		id:             "test-agent-remove",
		hostname:       "remove-test-host",
		version:        "1.24.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "100s",
		ip:             "10.0.0.70",
		status:         "offline",
		lastActive:     time.Now(),
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	err := db.UpsertAgent(testAgent)
	if err != nil {
		t.Fatalf("Failed to create test agent in DB: %v", err)
	}

	srv.sessions.Store(testAgent.id, testAgent)

	// Remove agent
	ctx := context.Background()
	resp, err := srv.RemoveAgent(ctx, &pb.RemoveAgentRequest{AgentId: testAgent.id})
	if err != nil {
		t.Fatalf("RemoveAgent failed: %v", err)
	}

	if !resp.Success {
		t.Error("Expected successful removal")
	}

	// Verify removal from sessions
	if _, ok := srv.sessions.Load(testAgent.id); ok {
		t.Error("Agent should be removed from sessions")
	}

	// Verify removal from DB
	var count int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM agents WHERE agent_id = $1", testAgent.id).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query agent: %v", err)
	}
	if count != 0 {
		t.Error("Agent should be removed from database")
	}
}

func TestAlertRulesIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	ctx := context.Background()

	// Create alert rule
	rule := &pb.AlertRule{
		Id:         "test-alert-integration",
		Name:       "Integration Test Alert",
		MetricType: "latency_p99",
		Threshold:  500.0,
		Comparison: "gt",
		WindowSec:  60,
		Enabled:    true,
		Recipients: "test@example.com",
	}

	createdRule, err := srv.CreateAlertRule(ctx, rule)
	if err != nil {
		t.Fatalf("CreateAlertRule failed: %v", err)
	}

	if createdRule.Id != rule.Id {
		t.Errorf("Expected rule ID '%s', got '%s'", rule.Id, createdRule.Id)
	}

	// List alert rules
	ruleList, err := srv.ListAlertRules(ctx, &pb.ListAlertRulesRequest{})
	if err != nil {
		t.Fatalf("ListAlertRules failed: %v", err)
	}

	found := false
	for _, r := range ruleList.Rules {
		if r.Id == rule.Id {
			found = true
			if r.Name != rule.Name {
				t.Errorf("Expected name '%s', got '%s'", rule.Name, r.Name)
			}
			break
		}
	}

	if !found {
		t.Error("Created rule not found in list")
	}

	// Delete alert rule
	deleteResp, err := srv.DeleteAlertRule(ctx, &pb.DeleteAlertRuleRequest{Id: rule.Id})
	if err != nil {
		t.Fatalf("DeleteAlertRule failed: %v", err)
	}

	if !deleteResp.Success {
		t.Error("Expected successful deletion")
	}

	// Verify deletion
	ruleList, err = srv.ListAlertRules(ctx, &pb.ListAlertRulesRequest{})
	if err != nil {
		t.Fatalf("ListAlertRules after delete failed: %v", err)
	}

	for _, r := range ruleList.Rules {
		if r.Id == rule.Id {
			t.Error("Rule should have been deleted")
		}
	}
}

func TestAnalyticsFallbackIntegration(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()

	// Test in-memory analytics (no ClickHouse)
	ctx := context.Background()

	// Add some mock data to analytics cache
	srv.analytics.Lock()
	srv.analytics.TotalRequests = 1000
	srv.analytics.TotalErrors = 50
	srv.analytics.StatusCodes["200"] = 900
	srv.analytics.StatusCodes["500"] = 50
	srv.analytics.RequestHistory = append(srv.analytics.RequestHistory, &pb.TimeSeriesPoint{
		Time:     "12:00",
		Requests: 100,
		Errors:   5,
	})
	srv.analytics.Unlock()

	// Get analytics
	resp, err := srv.GetAnalytics(ctx, &pb.AnalyticsRequest{TimeWindow: "1h"})
	if err != nil {
		t.Fatalf("GetAnalytics failed: %v", err)
	}

	if len(resp.StatusDistribution) == 0 {
		t.Error("Expected status distribution data")
	}

	if len(resp.RequestRate) == 0 {
		t.Error("Expected request rate data")
	}
}

func TestConcurrentAgentAccess(t *testing.T) {
	srv, db := setupTestServer(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	var wg sync.WaitGroup
	numGoroutines := 10

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			agent := &AgentSession{
				id:             "test-concurrent-" + string(rune('a'+index)),
				hostname:       "concurrent-host",
				version:        "1.25.0",
				agentVersion:   "0.2.0",
				instancesCount: 1,
				uptime:         "100s",
				ip:             "10.0.0." + string(rune('1'+index)),
				status:         "online",
				lastActive:     time.Now(),
				logChans:       make(map[string]chan *pb.LogEntry),
			}

			// Store in sessions
			srv.sessions.Store(agent.id, agent)

			// Write to DB
			if err := db.UpsertAgent(agent); err != nil {
				t.Errorf("Failed to upsert agent %s: %v", agent.id, err)
			}

			// Read from DB
			sessions := &sync.Map{}
			if err := db.LoadAgents(sessions); err != nil {
				t.Errorf("Failed to load agents: %v", err)
			}
		}(i)
	}

	wg.Wait()

	// Verify all agents were created
	count := 0
	srv.sessions.Range(func(key, value interface{}) bool {
		count++
		return true
	})

	if count < numGoroutines {
		t.Errorf("Expected at least %d agents in sessions, got %d", numGoroutines, count)
	}
}

// Helper function
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Benchmark
func BenchmarkHealthEndpoint(b *testing.B) {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "postgres://admin:testpassword@localhost:5432/avika_test?sslmode=disable"
	}

	db, err := NewDB(dsn)
	if err != nil {
		b.Skip("Database not available")
	}
	defer db.conn.Close()

	cfg := &config.Config{
		Server: config.ServerConfig{
			GRPCPort: 5020,
			HTTPPort: 5021,
		},
		Security: config.SecurityConfig{
			AllowedOrigins: []string{"*"},
		},
	}

	srv := &server{
		db:     db,
		config: cfg,
		analytics: &AnalyticsCache{
			StatusCodes:   make(map[string]int64),
			EndpointStats: make(map[string]*EndpointStats),
		},
	}

	httpServer := srv.createHTTPServer(cfg)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()
		httpServer.Handler.ServeHTTP(w, req)
	}
}
