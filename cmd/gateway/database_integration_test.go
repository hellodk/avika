//go:build integration

package main

import (
	"os"
	"sync"
	"testing"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// getTestDSN returns the database DSN for integration tests
func getTestDSN() string {
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		dsn = os.Getenv("DB_DSN")
	}
	if dsn == "" {
		panic("TEST_DB_DSN or DB_DSN environment variable required for integration tests")
	}
	return dsn
}

func setupTestDB(t *testing.T) *DB {
	db, err := NewDB(getTestDSN())
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}
	return db
}

func cleanupTestDB(t *testing.T, db *DB) {
	// Clean up test data
	_, err := db.conn.Exec("DELETE FROM agents WHERE agent_id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup test agents: %v", err)
	}
	_, err = db.conn.Exec("DELETE FROM alert_rules WHERE id LIKE 'test-%'")
	if err != nil {
		t.Logf("Warning: Failed to cleanup test alert rules: %v", err)
	}
}

func TestDatabaseConnection(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()

	// Verify connection
	err := db.conn.Ping()
	if err != nil {
		t.Fatalf("Failed to ping database: %v", err)
	}
}

func TestAgentUpsert(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	session := &AgentSession{
		id:             "test-agent-001",
		hostname:       "test-host",
		version:        "1.24.0",
		agentVersion:   "0.2.0",
		instancesCount: 2,
		uptime:         "3600s",
		ip:             "192.168.1.100",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          false,
		podIP:          "",
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	// Insert
	err := db.UpsertAgent(session)
	if err != nil {
		t.Fatalf("Failed to upsert agent: %v", err)
	}

	// Verify insertion
	var count int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM agents WHERE agent_id = $1", session.id).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query agent count: %v", err)
	}
	if count != 1 {
		t.Errorf("Expected 1 agent, got %d", count)
	}

	// Update
	session.status = "offline"
	session.lastActive = time.Now()
	err = db.UpsertAgent(session)
	if err != nil {
		t.Fatalf("Failed to update agent: %v", err)
	}

	// Verify update
	var status string
	err = db.conn.QueryRow("SELECT status FROM agents WHERE agent_id = $1", session.id).Scan(&status)
	if err != nil {
		t.Fatalf("Failed to query agent status: %v", err)
	}
	if status != "offline" {
		t.Errorf("Expected status 'offline', got '%s'", status)
	}
}

func TestAgentStatusUpdate(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create test agent first
	session := &AgentSession{
		id:             "test-agent-002",
		hostname:       "test-host-2",
		version:        "1.24.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "100s",
		ip:             "192.168.1.101",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          false,
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	err := db.UpsertAgent(session)
	if err != nil {
		t.Fatalf("Failed to create test agent: %v", err)
	}

	// Update status
	now := time.Now().Unix()
	err = db.UpdateAgentStatus(session.id, "offline", now)
	if err != nil {
		t.Fatalf("Failed to update agent status: %v", err)
	}

	// Verify
	var status string
	var lastSeen int64
	err = db.conn.QueryRow("SELECT status, last_seen FROM agents WHERE agent_id = $1", session.id).Scan(&status, &lastSeen)
	if err != nil {
		t.Fatalf("Failed to query agent: %v", err)
	}

	if status != "offline" {
		t.Errorf("Expected status 'offline', got '%s'", status)
	}
	if lastSeen != now {
		t.Errorf("Expected last_seen %d, got %d", now, lastSeen)
	}
}

func TestAgentRemoval(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create test agent
	session := &AgentSession{
		id:             "test-agent-003",
		hostname:       "test-host-3",
		version:        "1.24.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "50s",
		ip:             "192.168.1.102",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          false,
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	err := db.UpsertAgent(session)
	if err != nil {
		t.Fatalf("Failed to create test agent: %v", err)
	}

	// Remove agent
	err = db.RemoveAgent(session.id)
	if err != nil {
		t.Fatalf("Failed to remove agent: %v", err)
	}

	// Verify removal
	var count int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM agents WHERE agent_id = $1", session.id).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query agent count: %v", err)
	}
	if count != 0 {
		t.Errorf("Expected 0 agents after removal, got %d", count)
	}
}

func TestLoadAgents(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create multiple test agents
	agents := []*AgentSession{
		{
			id:             "test-agent-004",
			hostname:       "host-1",
			version:        "1.24.0",
			agentVersion:   "0.2.0",
			instancesCount: 1,
			uptime:         "100s",
			ip:             "10.0.0.1",
			status:         "online",
			lastActive:     time.Now(),
			logChans:       make(map[string]chan *pb.LogEntry),
		},
		{
			id:             "test-agent-005",
			hostname:       "host-2",
			version:        "1.25.0",
			agentVersion:   "0.2.1",
			instancesCount: 2,
			uptime:         "200s",
			ip:             "10.0.0.2",
			status:         "offline",
			lastActive:     time.Now().Add(-1 * time.Hour),
			logChans:       make(map[string]chan *pb.LogEntry),
		},
	}

	for _, agent := range agents {
		if err := db.UpsertAgent(agent); err != nil {
			t.Fatalf("Failed to create test agent %s: %v", agent.id, err)
		}
	}

	// Load agents
	sessions := &sync.Map{}
	err := db.LoadAgents(sessions)
	if err != nil {
		t.Fatalf("Failed to load agents: %v", err)
	}

	// Verify loaded agents
	loadedCount := 0
	sessions.Range(func(key, value interface{}) bool {
		if session, ok := value.(*AgentSession); ok {
			if session.id == "test-agent-004" || session.id == "test-agent-005" {
				loadedCount++
			}
		}
		return true
	})

	if loadedCount != 2 {
		t.Errorf("Expected to load 2 test agents, loaded %d", loadedCount)
	}
}

func TestPruneStaleAgents(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create stale agent (offline for 30 days)
	staleAgent := &AgentSession{
		id:             "test-agent-stale",
		hostname:       "stale-host",
		version:        "1.24.0",
		agentVersion:   "0.1.0",
		instancesCount: 1,
		uptime:         "0s",
		ip:             "10.0.0.99",
		status:         "offline",
		lastActive:     time.Now().Add(-30 * 24 * time.Hour), // 30 days ago
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	// Create fresh agent
	freshAgent := &AgentSession{
		id:             "test-agent-fresh",
		hostname:       "fresh-host",
		version:        "1.25.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "1000s",
		ip:             "10.0.0.100",
		status:         "offline",
		lastActive:     time.Now().Add(-1 * time.Hour), // 1 hour ago
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	if err := db.UpsertAgent(staleAgent); err != nil {
		t.Fatalf("Failed to create stale agent: %v", err)
	}
	if err := db.UpsertAgent(freshAgent); err != nil {
		t.Fatalf("Failed to create fresh agent: %v", err)
	}

	// Prune agents older than 10 days
	prunedIDs, err := db.PruneStaleAgents(10 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("Failed to prune stale agents: %v", err)
	}

	// Verify stale agent was pruned
	found := false
	for _, id := range prunedIDs {
		if id == staleAgent.id {
			found = true
			break
		}
	}
	if !found {
		t.Error("Stale agent should have been pruned")
	}

	// Verify fresh agent still exists
	var count int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM agents WHERE agent_id = $1", freshAgent.id).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query fresh agent: %v", err)
	}
	if count != 1 {
		t.Error("Fresh agent should not have been pruned")
	}
}

func TestAlertRuleCRUD(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create alert rule
	rule := &pb.AlertRule{
		Id:         "test-alert-001",
		Name:       "High Error Rate",
		MetricType: "error_rate",
		Threshold:  5.0,
		Comparison: "gt",
		WindowSec:  300,
		Enabled:    true,
		Recipients: "admin@example.com",
	}

	err := db.UpsertAlertRule(rule)
	if err != nil {
		t.Fatalf("Failed to create alert rule: %v", err)
	}

	// List and verify
	rules, err := db.ListAlertRules()
	if err != nil {
		t.Fatalf("Failed to list alert rules: %v", err)
	}

	found := false
	for _, r := range rules {
		if r.Id == rule.Id {
			found = true
			if r.Name != rule.Name {
				t.Errorf("Expected name '%s', got '%s'", rule.Name, r.Name)
			}
			if r.Threshold != rule.Threshold {
				t.Errorf("Expected threshold %f, got %f", rule.Threshold, r.Threshold)
			}
			break
		}
	}
	if !found {
		t.Error("Alert rule not found in list")
	}

	// Update rule
	rule.Threshold = 10.0
	rule.Enabled = false
	err = db.UpsertAlertRule(rule)
	if err != nil {
		t.Fatalf("Failed to update alert rule: %v", err)
	}

	// Verify update
	rules, err = db.ListAlertRules()
	if err != nil {
		t.Fatalf("Failed to list alert rules after update: %v", err)
	}

	for _, r := range rules {
		if r.Id == rule.Id {
			if r.Threshold != 10.0 {
				t.Errorf("Expected updated threshold 10.0, got %f", r.Threshold)
			}
			if r.Enabled != false {
				t.Error("Expected rule to be disabled")
			}
			break
		}
	}

	// Delete rule
	err = db.DeleteAlertRule(rule.Id)
	if err != nil {
		t.Fatalf("Failed to delete alert rule: %v", err)
	}

	// Verify deletion
	rules, err = db.ListAlertRules()
	if err != nil {
		t.Fatalf("Failed to list alert rules after deletion: %v", err)
	}

	for _, r := range rules {
		if r.Id == rule.Id {
			t.Error("Alert rule should have been deleted")
		}
	}
}

func TestPodAgentHandling(t *testing.T) {
	db := setupTestDB(t)
	defer db.conn.Close()
	defer cleanupTestDB(t, db)

	// Create pod agent
	podAgent := &AgentSession{
		id:             "test-agent-pod",
		hostname:       "nginx-deployment-abc123-xyz",
		version:        "1.25.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "3600s",
		ip:             "10.244.0.5",
		status:         "online",
		lastActive:     time.Now(),
		isPod:          true,
		podIP:          "10.244.0.5",
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	err := db.UpsertAgent(podAgent)
	if err != nil {
		t.Fatalf("Failed to create pod agent: %v", err)
	}

	// Load and verify
	sessions := &sync.Map{}
	err = db.LoadAgents(sessions)
	if err != nil {
		t.Fatalf("Failed to load agents: %v", err)
	}

	val, ok := sessions.Load(podAgent.id)
	if !ok {
		t.Fatal("Pod agent not found after load")
	}

	loaded := val.(*AgentSession)
	if !loaded.isPod {
		t.Error("Expected isPod to be true")
	}
	if loaded.podIP != podAgent.podIP {
		t.Errorf("Expected podIP '%s', got '%s'", podAgent.podIP, loaded.podIP)
	}
}

// Benchmark tests
func BenchmarkAgentUpsert(b *testing.B) {
	db, err := NewDB(getTestDSN())
	if err != nil {
		b.Skip("Database not available for benchmark")
	}
	defer db.conn.Close()

	session := &AgentSession{
		id:             "bench-agent",
		hostname:       "bench-host",
		version:        "1.25.0",
		agentVersion:   "0.2.0",
		instancesCount: 1,
		uptime:         "100s",
		ip:             "10.0.0.200",
		status:         "online",
		lastActive:     time.Now(),
		logChans:       make(map[string]chan *pb.LogEntry),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		session.lastActive = time.Now()
		db.UpsertAgent(session)
	}

	// Cleanup
	db.RemoveAgent(session.id)
}

func BenchmarkListAlertRules(b *testing.B) {
	db, err := NewDB(getTestDSN())
	if err != nil {
		b.Skip("Database not available for benchmark")
	}
	defer db.conn.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		db.ListAlertRules()
	}
}
