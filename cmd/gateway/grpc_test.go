package main_test

import (
	"context"
	"testing"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// TestAgentMessageCreation tests creating agent messages
func TestAgentMessageCreation(t *testing.T) {
	msg := &pb.AgentMessage{
		AgentId:   "test-agent-001",
		Timestamp: time.Now().Unix(),
		Payload: &pb.AgentMessage_Heartbeat{
			Heartbeat: &pb.Heartbeat{
				Hostname: "test-host",
				Version:  "1.25.0",
				Uptime:   3600.0,
				Instances: []*pb.NginxInstance{
					{
						Pid:     "1234",
						Version: "1.25.0",
						Status:  "RUNNING",
					},
				},
			},
		},
	}

	if msg.AgentId != "test-agent-001" {
		t.Errorf("Expected agent ID 'test-agent-001', got '%s'", msg.AgentId)
	}

	hb := msg.GetHeartbeat()
	if hb == nil {
		t.Fatal("Expected heartbeat payload")
	}

	if hb.Hostname != "test-host" {
		t.Errorf("Expected hostname 'test-host', got '%s'", hb.Hostname)
	}

	if len(hb.Instances) != 1 {
		t.Errorf("Expected 1 instance, got %d", len(hb.Instances))
	}
}

// TestLogEntryMessage tests log entry message creation
func TestLogEntryMessage(t *testing.T) {
	entry := &pb.LogEntry{
		Timestamp:      time.Now().Unix(),
		RemoteAddr:     "192.168.1.100",
		RequestMethod:  "GET",
		RequestUri:     "/api/health",
		Status:         200,
		BodyBytesSent:  1024,
		Referer:        "-",
		UserAgent:      "Mozilla/5.0",
		RequestTime:    0.025,
		UpstreamStatus: "200",
	}

	if entry.Status != 200 {
		t.Errorf("Expected status 200, got %d", entry.Status)
	}

	if entry.RequestMethod != "GET" {
		t.Errorf("Expected method 'GET', got '%s'", entry.RequestMethod)
	}
}

// TestMetricsMessage tests metrics message creation
func TestMetricsMessage(t *testing.T) {
	metrics := &pb.NginxMetrics{
		ActiveConnections:   100,
		Reading:             10,
		Writing:             5,
		Waiting:             85,
		AcceptedConnections: 1000,
		HandledConnections:  1000,
		TotalRequests:       5000,
		System: &pb.SystemMetrics{
			CpuUsagePercent:    45.5,
			MemoryUsedBytes:    2048 * 1024 * 1024,
			MemoryTotalBytes:   8192 * 1024 * 1024,
			MemoryUsagePercent: 25.0,
		},
	}

	if metrics.ActiveConnections != 100 {
		t.Errorf("Expected 100 active connections, got %d", metrics.ActiveConnections)
	}

	if metrics.System == nil {
		t.Fatal("Expected system metrics")
	}

	if metrics.System.CpuUsagePercent != 45.5 {
		t.Errorf("Expected CPU usage 45.5, got %f", metrics.System.CpuUsagePercent)
	}
}

// TestAlertRuleMessage tests alert rule message creation
func TestAlertRuleMessage(t *testing.T) {
	rule := &pb.AlertRule{
		Id:         "alert-001",
		Name:       "High CPU Alert",
		MetricType: "cpu_usage",
		Threshold:  80.0,
		Comparison: "gt",
		WindowSec:  300,
		Enabled:    true,
		Recipients: "admin@example.com,ops@example.com",
	}

	if rule.Id != "alert-001" {
		t.Errorf("Expected ID 'alert-001', got '%s'", rule.Id)
	}

	if rule.Threshold != 80.0 {
		t.Errorf("Expected threshold 80.0, got %f", rule.Threshold)
	}

	if !rule.Enabled {
		t.Error("Expected rule to be enabled")
	}
}

// TestAgentInfoMessage tests agent info response creation
func TestAgentInfoMessage(t *testing.T) {
	agentInfo := &pb.AgentInfo{
		AgentId:        "agent-123",
		Hostname:       "nginx-server-1",
		Version:        "1.25.0",
		AgentVersion:   "0.2.0",
		Status:         "online",
		InstancesCount: 2,
		Uptime:         "3600.0s",
		Ip:             "192.168.1.50",
		LastSeen:       time.Now().Unix(),
		IsPod:          true,
		PodIp:          "10.244.0.5",
		BuildDate:      "2026-02-15",
		GitCommit:      "abc123",
		GitBranch:      "main",
	}

	if agentInfo.Status != "online" {
		t.Errorf("Expected status 'online', got '%s'", agentInfo.Status)
	}

	if !agentInfo.IsPod {
		t.Error("Expected IsPod to be true")
	}

	if agentInfo.InstancesCount != 2 {
		t.Errorf("Expected 2 instances, got %d", agentInfo.InstancesCount)
	}
}

// TestAnalyticsRequest tests analytics request creation
func TestAnalyticsRequest(t *testing.T) {
	req := &pb.AnalyticsRequest{
		TimeWindow: "24h",
		AgentId:    "agent-001",
	}

	if req.TimeWindow != "24h" {
		t.Errorf("Expected time window '24h', got '%s'", req.TimeWindow)
	}
}

// TestTimeSeriesPoint tests time series data point
func TestTimeSeriesPoint(t *testing.T) {
	point := &pb.TimeSeriesPoint{
		Time:     "12:00",
		Requests: 1000,
		Errors:   10,
	}

	if point.Requests != 1000 {
		t.Errorf("Expected 1000 requests, got %d", point.Requests)
	}

	errorRate := float64(point.Errors) / float64(point.Requests) * 100
	if errorRate != 1.0 {
		t.Errorf("Expected error rate 1.0%%, got %f%%", errorRate)
	}
}

// TestConfigRequest tests config request message
func TestConfigRequest(t *testing.T) {
	req := &pb.ConfigRequest{
		InstanceId: "agent-001",
		ConfigPath: "/etc/nginx/nginx.conf",
	}

	if req.InstanceId != "agent-001" {
		t.Errorf("Expected instance ID 'agent-001', got '%s'", req.InstanceId)
	}

	if req.ConfigPath != "/etc/nginx/nginx.conf" {
		t.Errorf("Expected config path '/etc/nginx/nginx.conf', got '%s'", req.ConfigPath)
	}
}

// TestRecommendation tests recommendation message
func TestRecommendation(t *testing.T) {
	rec := &pb.Recommendation{
		Id:                   1,
		Title:                "Enable Gzip Compression",
		Description:          "Enabling gzip compression can reduce bandwidth usage by up to 70%",
		Details:              "Detailed explanation of the recommendation",
		Category:             "Performance",
		Impact:               "high",
		Confidence:           0.95,
		EstimatedImprovement: "30% bandwidth reduction",
		CurrentConfig:        "gzip off;",
		SuggestedConfig:      "gzip on;",
	}

	if rec.Impact != "high" {
		t.Errorf("Expected impact 'high', got '%s'", rec.Impact)
	}

	if rec.Category != "Performance" {
		t.Errorf("Expected category 'Performance', got '%s'", rec.Category)
	}

	if rec.Confidence != 0.95 {
		t.Errorf("Expected confidence 0.95, got %f", rec.Confidence)
	}
}

// TestUptimeReport tests uptime report message
func TestUptimeReport(t *testing.T) {
	report := &pb.UptimeReport{
		Timestamp: time.Now().Unix(),
		Status:    "UP",
		LatencyMs: 25.5,
		CheckType: "HTTP",
		Target:    "nginx-server-1",
		Error:     "",
	}

	if report.Status != "UP" {
		t.Errorf("Expected status 'UP', got '%s'", report.Status)
	}

	if report.LatencyMs != 25.5 {
		t.Errorf("Expected latency 25.5ms, got %fms", report.LatencyMs)
	}
}

// TestGRPCContextCancellation tests that gRPC context cancellation works
func TestGRPCContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan bool)
	go func() {
		<-ctx.Done()
		done <- true
	}()

	cancel()

	select {
	case <-done:
		// Success
	case <-time.After(time.Second):
		t.Error("Context cancellation was not propagated")
	}
}

// TestGRPCContextTimeout tests context timeout behavior
func TestGRPCContextTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	select {
	case <-ctx.Done():
		if ctx.Err() != context.DeadlineExceeded {
			t.Errorf("Expected DeadlineExceeded, got %v", ctx.Err())
		}
	case <-time.After(200 * time.Millisecond):
		t.Error("Context timeout was not triggered")
	}
}

// Benchmark tests
func BenchmarkAgentMessageCreation(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = &pb.AgentMessage{
			AgentId:   "test-agent",
			Timestamp: time.Now().Unix(),
			Payload: &pb.AgentMessage_Heartbeat{
				Heartbeat: &pb.Heartbeat{
					Hostname: "test-host",
					Version:  "1.25.0",
				},
			},
		}
	}
}

func BenchmarkLogEntryCreation(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = &pb.LogEntry{
			Timestamp:     time.Now().Unix(),
			RemoteAddr:    "192.168.1.100",
			RequestMethod: "GET",
			RequestUri:    "/api/health",
			Status:        200,
			BodyBytesSent: 1024,
		}
	}
}
