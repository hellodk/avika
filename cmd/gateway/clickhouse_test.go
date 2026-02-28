package main

import (
	"testing"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

func TestGetEnvInt(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		defaultVal int
		expected   int
	}{
		{"default_value", "NONEXISTENT_ENV_VAR_12345", 100, 100},
		{"zero_default", "NONEXISTENT_ENV_VAR_12345", 0, 0},
		{"negative_default", "NONEXISTENT_ENV_VAR_12345", -1, -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getEnvInt(tt.key, tt.defaultVal)
			if result != tt.expected {
				t.Errorf("Expected %d, got %d", tt.expected, result)
			}
		})
	}
}

func TestLogBatchItem(t *testing.T) {
	entry := &pb.LogEntry{
		Timestamp:     time.Now().Unix(),
		Content:       "192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] \"GET /api/test HTTP/1.1\" 200 1234",
		RemoteAddr:    "192.168.1.1",
		RequestMethod: "GET",
		RequestUri:    "/api/test",
		Status:        200,
	}
	agentID := "agent-001"

	item := logBatchItem{
		entry:   entry,
		agentID: agentID,
	}

	if item.entry != entry {
		t.Error("Entry not properly assigned")
	}
	if item.agentID != agentID {
		t.Error("AgentID not properly assigned")
	}
}

func TestSpanBatchItem(t *testing.T) {
	now := time.Now()
	item := spanBatchItem{
		traceID: "trace-123",
		spanID:  "span-456",
		parent:  "span-000",
		name:    "http_request",
		start:   now,
		end:     now.Add(100 * time.Millisecond),
		attrs:   map[string]string{"http.method": "GET", "http.status_code": "200"},
		agentID: "agent-001",
	}

	if item.traceID != "trace-123" {
		t.Error("TraceID not properly assigned")
	}
	if item.spanID != "span-456" {
		t.Error("SpanID not properly assigned")
	}
	if len(item.attrs) != 2 {
		t.Errorf("Expected 2 attrs, got %d", len(item.attrs))
	}
}

func TestSysBatchItem(t *testing.T) {
	entry := &pb.SystemMetrics{
		CpuUsagePercent:    45.5,
		MemoryUsagePercent: 65.2,
		MemoryTotalBytes:   16000000000,
		MemoryUsedBytes:    10400000000,
		NetworkRxBytes:     1000000,
		NetworkTxBytes:     500000,
	}

	item := sysBatchItem{
		entry:   entry,
		agentID: "agent-001",
	}

	if item.entry.CpuUsagePercent != 45.5 {
		t.Errorf("Expected CPU usage 45.5, got %f", item.entry.CpuUsagePercent)
	}
}

func TestNginxBatchItem(t *testing.T) {
	entry := &pb.NginxMetrics{
		ActiveConnections:  100,
		RequestsPerSecond:  500.0,
		Reading:            10,
		Writing:            20,
		Waiting:            70,
		TotalRequests:      50000,
	}

	item := nginxBatchItem{
		entry:   entry,
		agentID: "agent-001",
	}

	if item.entry.ActiveConnections != 100 {
		t.Errorf("Expected 100 active connections, got %d", item.entry.ActiveConnections)
	}
}

func TestBufferConfiguration(t *testing.T) {
	if logBufferSize <= 0 {
		t.Error("Log buffer size should be positive")
	}
	if spanBufferSize <= 0 {
		t.Error("Span buffer size should be positive")
	}
	if sysBufferSize <= 0 {
		t.Error("Sys buffer size should be positive")
	}
	if nginxBufferSize <= 0 {
		t.Error("Nginx buffer size should be positive")
	}
	if gwBufferSize <= 0 {
		t.Error("Gw buffer size should be positive")
	}
}

func TestBatchConfiguration(t *testing.T) {
	if logBatchSize <= 0 {
		t.Error("Log batch size should be positive")
	}
	if spanBatchSize <= 0 {
		t.Error("Span batch size should be positive")
	}

	if logBatchSize > logBufferSize {
		t.Error("Log batch size should not exceed buffer size")
	}
	if spanBatchSize > spanBufferSize {
		t.Error("Span batch size should not exceed buffer size")
	}
}

func TestConnectionPoolConfiguration(t *testing.T) {
	if maxOpenConns <= 0 {
		t.Error("Max open conns should be positive")
	}
	if maxIdleConns <= 0 {
		t.Error("Max idle conns should be positive")
	}
	if maxIdleConns > maxOpenConns {
		t.Error("Max idle conns should not exceed max open conns")
	}
}

func TestParseLogLine(t *testing.T) {
	tests := []struct {
		name     string
		line     string
		expected map[string]string
	}{
		{
			name: "standard_combined_format",
			line: `192.168.1.1 - john [01/Jan/2024:00:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234 "http://example.com" "Mozilla/5.0"`,
			expected: map[string]string{
				"client_ip":   "192.168.1.1",
				"method":      "GET",
				"path":        "/api/users",
				"status_code": "200",
			},
		},
		{
			name: "with_query_params",
			line: `10.0.0.1 - - [01/Jan/2024:00:00:00 +0000] "GET /search?q=test HTTP/1.1" 200 5678`,
			expected: map[string]string{
				"client_ip":   "10.0.0.1",
				"method":      "GET",
				"path":        "/search",
				"status_code": "200",
			},
		},
		{
			name: "post_request",
			line: `172.16.0.1 - admin [01/Jan/2024:00:00:00 +0000] "POST /api/login HTTP/1.1" 302 0`,
			expected: map[string]string{
				"client_ip":   "172.16.0.1",
				"method":      "POST",
				"status_code": "302",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed := parseSimpleLogLine(tt.line)
			for key, expected := range tt.expected {
				if parsed[key] != expected {
					t.Errorf("Expected %s=%s, got %s", key, expected, parsed[key])
				}
			}
		})
	}
}

func parseSimpleLogLine(line string) map[string]string {
	result := make(map[string]string)

	for i := 0; i < len(line); i++ {
		if line[i] == ' ' {
			result["client_ip"] = line[:i]
			break
		}
	}

	methodStart := -1
	methodEnd := -1
	for i := 0; i < len(line); i++ {
		if line[i] == '"' {
			if methodStart == -1 {
				methodStart = i + 1
			} else {
				methodEnd = i
				break
			}
		}
	}

	if methodStart > 0 && methodEnd > methodStart {
		request := line[methodStart:methodEnd]
		parts := splitBySpace(request)
		if len(parts) >= 2 {
			result["method"] = parts[0]
			path := parts[1]
			for j := 0; j < len(path); j++ {
				if path[j] == '?' {
					path = path[:j]
					break
				}
			}
			result["path"] = path
		}
	}

	statusStart := methodEnd + 2
	if statusStart < len(line) {
		for i := statusStart; i < len(line); i++ {
			if line[i] == ' ' {
				result["status_code"] = line[statusStart:i]
				break
			}
		}
	}

	return result
}

func splitBySpace(s string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ' ' {
			if i > start {
				result = append(result, s[start:i])
			}
			start = i + 1
		}
	}
	return result
}

func TestTimeWindowCalculation(t *testing.T) {
	tests := []struct {
		name      string
		windowSec int32
		expected  time.Duration
	}{
		{"5_minutes", 300, 5 * time.Minute},
		{"1_hour", 3600, time.Hour},
		{"24_hours", 86400, 24 * time.Hour},
		{"1_minute", 60, time.Minute},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			duration := time.Duration(tt.windowSec) * time.Second
			if duration != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, duration)
			}
		})
	}
}

func TestMetricTypeValidation(t *testing.T) {
	validMetrics := []string{
		"cpu_usage",
		"memory_usage",
		"disk_usage",
		"request_rate",
		"error_rate",
		"response_time",
		"active_connections",
	}

	for _, metric := range validMetrics {
		if !isValidMetricType(metric) {
			t.Errorf("Metric %s should be valid", metric)
		}
	}

	invalidMetrics := []string{"invalid", "", "drop_table", "'; DROP TABLE --"}
	for _, metric := range invalidMetrics {
		if isValidMetricType(metric) {
			t.Errorf("Metric %s should be invalid", metric)
		}
	}
}

func isValidMetricType(metric string) bool {
	validTypes := map[string]bool{
		"cpu_usage":          true,
		"memory_usage":       true,
		"disk_usage":         true,
		"request_rate":       true,
		"error_rate":         true,
		"response_time":      true,
		"active_connections": true,
	}
	return validTypes[metric]
}

func BenchmarkLogBatchItemCreation(b *testing.B) {
	entry := &pb.LogEntry{
		Timestamp:     time.Now().Unix(),
		Content:       "192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] \"GET /api/test HTTP/1.1\" 200 1234",
		RemoteAddr:    "192.168.1.1",
		RequestMethod: "GET",
		RequestUri:    "/api/test",
		Status:        200,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = logBatchItem{
			entry:   entry,
			agentID: "agent-001",
		}
	}
}

func BenchmarkSpanBatchItemCreation(b *testing.B) {
	now := time.Now()
	attrs := map[string]string{"http.method": "GET", "http.status_code": "200"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = spanBatchItem{
			traceID: "trace-123",
			spanID:  "span-456",
			parent:  "span-000",
			name:    "http_request",
			start:   now,
			end:     now.Add(100 * time.Millisecond),
			attrs:   attrs,
			agentID: "agent-001",
		}
	}
}

func BenchmarkParseLogLine(b *testing.B) {
	line := `192.168.1.1 - john [01/Jan/2024:00:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234 "http://example.com" "Mozilla/5.0"`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parseSimpleLogLine(line)
	}
}
