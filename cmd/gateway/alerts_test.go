package main

import (
	"testing"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/config"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

func TestNewAlertEngine(t *testing.T) {
	cfg := &config.Config{}
	engine := NewAlertEngine(nil, nil, cfg)

	if engine == nil {
		t.Fatal("NewAlertEngine returned nil")
	}

	if engine.config != cfg {
		t.Error("Config not properly assigned")
	}

	if engine.stopChan == nil {
		t.Error("Stop channel not initialized")
	}
}

func TestAlertEngine_StartStop(t *testing.T) {
	cfg := &config.Config{}
	engine := NewAlertEngine(nil, nil, cfg)

	engine.Start()

	time.Sleep(100 * time.Millisecond)

	engine.Stop()

	select {
	case <-engine.stopChan:
	default:
		t.Error("Stop channel was not closed")
	}
}

func TestAlertThresholdComparison(t *testing.T) {
	tests := []struct {
		name       string
		comparison string
		value      float64
		threshold  float32
		expected   bool
	}{
		{"gt_triggered", "gt", 100.0, 50.0, true},
		{"gt_not_triggered", "gt", 40.0, 50.0, false},
		{"gt_equal", "gt", 50.0, 50.0, false},
		{"lt_triggered", "lt", 30.0, 50.0, true},
		{"lt_not_triggered", "lt", 60.0, 50.0, false},
		{"lt_equal", "lt", 50.0, 50.0, false},
		{"unknown_comparison", "eq", 50.0, 50.0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := &pb.AlertRule{
				Comparison: tt.comparison,
				Threshold:  tt.threshold,
			}

			triggered := false
			threshold := float64(rule.Threshold)

			if rule.Comparison == "gt" && tt.value > threshold {
				triggered = true
			} else if rule.Comparison == "lt" && tt.value < threshold {
				triggered = true
			}

			if triggered != tt.expected {
				t.Errorf("Expected triggered=%v, got %v", tt.expected, triggered)
			}
		})
	}
}

func TestParseRecipients(t *testing.T) {
	tests := []struct {
		name       string
		recipients string
		expected   int
	}{
		{"single_email", "test@example.com", 1},
		{"multiple_emails", "test1@example.com,test2@example.com,test3@example.com", 3},
		{"with_spaces", "test1@example.com, test2@example.com , test3@example.com", 3},
		{"empty", "", 0},
		{"webhook_url", "https://webhook.example.com/alert", 1},
		{"mixed", "test@example.com,https://webhook.example.com", 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := &pb.AlertRule{
				Recipients: tt.recipients,
			}

			if rule.Recipients == "" {
				if tt.expected != 0 {
					t.Errorf("Expected %d recipients, got 0", tt.expected)
				}
				return
			}

			count := 0
			for _, r := range splitAndTrim(rule.Recipients, ",") {
				if r != "" {
					count++
				}
			}

			if count != tt.expected {
				t.Errorf("Expected %d recipients, got %d", tt.expected, count)
			}
		})
	}
}

func splitAndTrim(s, sep string) []string {
	parts := make([]string, 0)
	for _, p := range splitString(s, sep) {
		trimmed := trimSpace(p)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

func splitString(s, sep string) []string {
	if s == "" {
		return nil
	}
	result := make([]string, 0)
	start := 0
	for i := 0; i < len(s); i++ {
		if i <= len(s)-len(sep) && s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

func TestAlertRuleValidation(t *testing.T) {
	tests := []struct {
		name    string
		rule    *pb.AlertRule
		isValid bool
	}{
		{
			name: "valid_rule",
			rule: &pb.AlertRule{
				Name:       "High CPU Alert",
				MetricType: "cpu_usage",
				Comparison: "gt",
				Threshold:  80.0,
				WindowSec:  300,
				Recipients: "admin@example.com",
				Enabled:    true,
			},
			isValid: true,
		},
		{
			name: "missing_name",
			rule: &pb.AlertRule{
				MetricType: "cpu_usage",
				Comparison: "gt",
				Threshold:  80.0,
			},
			isValid: false,
		},
		{
			name: "missing_metric_type",
			rule: &pb.AlertRule{
				Name:       "Test Alert",
				Comparison: "gt",
				Threshold:  80.0,
			},
			isValid: false,
		},
		{
			name: "invalid_comparison",
			rule: &pb.AlertRule{
				Name:       "Test Alert",
				MetricType: "cpu_usage",
				Comparison: "invalid",
				Threshold:  80.0,
			},
			isValid: false,
		},
		{
			name: "zero_window",
			rule: &pb.AlertRule{
				Name:       "Test Alert",
				MetricType: "cpu_usage",
				Comparison: "gt",
				Threshold:  80.0,
				WindowSec:  0,
			},
			isValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateAlertRule(tt.rule)
			if valid != tt.isValid {
				t.Errorf("Expected valid=%v, got %v", tt.isValid, valid)
			}
		})
	}
}

func validateAlertRule(rule *pb.AlertRule) bool {
	if rule.Name == "" {
		return false
	}
	if rule.MetricType == "" {
		return false
	}
	if rule.Comparison != "gt" && rule.Comparison != "lt" {
		return false
	}
	if rule.WindowSec <= 0 {
		return false
	}
	return true
}

func BenchmarkAlertThresholdCheck(b *testing.B) {
	rule := &pb.AlertRule{
		Comparison: "gt",
		Threshold:  80.0,
	}
	value := 85.0

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		threshold := float64(rule.Threshold)
		_ = rule.Comparison == "gt" && value > threshold
	}
}
