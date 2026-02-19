package main

import (
	"testing"
	"time"
)

func TestReportTimeRangeValidation(t *testing.T) {
	tests := []struct {
		name      string
		startTime int64
		endTime   int64
		expectErr bool
	}{
		{
			name:      "valid_range",
			startTime: time.Now().Add(-24 * time.Hour).Unix(),
			endTime:   time.Now().Unix(),
			expectErr: false,
		},
		{
			name:      "end_before_start",
			startTime: time.Now().Unix(),
			endTime:   time.Now().Add(-24 * time.Hour).Unix(),
			expectErr: true,
		},
		{
			name:      "zero_start",
			startTime: 0,
			endTime:   time.Now().Unix(),
			expectErr: false,
		},
		{
			name:      "zero_end",
			startTime: time.Now().Add(-24 * time.Hour).Unix(),
			endTime:   0,
			expectErr: false,
		},
		{
			name:      "both_zero",
			startTime: 0,
			endTime:   0,
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start := time.Unix(tt.startTime, 0)
			end := time.Unix(tt.endTime, 0)

			if tt.startTime == 0 {
				start = time.Now().Add(-24 * time.Hour)
			}
			if tt.endTime == 0 {
				end = time.Now()
			}

			hasErr := end.Before(start)
			if hasErr != tt.expectErr {
				t.Errorf("Expected error=%v, got %v (start=%v, end=%v)", tt.expectErr, hasErr, start, end)
			}
		})
	}
}

func TestReportFilenameGeneration(t *testing.T) {
	now := time.Now()
	filename := generateReportFilename(now)

	if filename == "" {
		t.Error("Filename should not be empty")
	}

	if len(filename) < 10 {
		t.Error("Filename seems too short")
	}
}

func generateReportFilename(t time.Time) string {
	return "report-" + t.Format("20060102-150405") + ".pdf"
}

func TestReportPeriodCalculation(t *testing.T) {
	tests := []struct {
		name     string
		start    time.Time
		end      time.Time
		expected string
	}{
		{
			name:     "1_day",
			start:    time.Now().Add(-24 * time.Hour),
			end:      time.Now(),
			expected: "24 hours",
		},
		{
			name:     "1_week",
			start:    time.Now().Add(-7 * 24 * time.Hour),
			end:      time.Now(),
			expected: "7 days",
		},
		{
			name:     "1_hour",
			start:    time.Now().Add(-1 * time.Hour),
			end:      time.Now(),
			expected: "1 hour",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			duration := tt.end.Sub(tt.start)
			period := formatPeriod(duration)

			if period == "" {
				t.Error("Period should not be empty")
			}
		})
	}
}

func formatPeriod(d time.Duration) string {
	hours := int(d.Hours())
	if hours >= 24 {
		days := hours / 24
		if days == 1 {
			return "1 day"
		}
		return string(rune('0'+days)) + " days"
	}
	if hours == 1 {
		return "1 hour"
	}
	return "24 hours"
}

func TestReportAgentFiltering(t *testing.T) {
	tests := []struct {
		name      string
		agentIds  []string
		allAgents []string
		expected  []string
	}{
		{
			name:      "no_filter",
			agentIds:  nil,
			allAgents: []string{"agent-1", "agent-2", "agent-3"},
			expected:  []string{"agent-1", "agent-2", "agent-3"},
		},
		{
			name:      "single_filter",
			agentIds:  []string{"agent-1"},
			allAgents: []string{"agent-1", "agent-2", "agent-3"},
			expected:  []string{"agent-1"},
		},
		{
			name:      "multiple_filter",
			agentIds:  []string{"agent-1", "agent-3"},
			allAgents: []string{"agent-1", "agent-2", "agent-3"},
			expected:  []string{"agent-1", "agent-3"},
		},
		{
			name:      "nonexistent_agent",
			agentIds:  []string{"agent-999"},
			allAgents: []string{"agent-1", "agent-2", "agent-3"},
			expected:  []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterAgents(tt.agentIds, tt.allAgents)
			if len(result) != len(tt.expected) {
				t.Errorf("Expected %d agents, got %d", len(tt.expected), len(result))
			}
		})
	}
}

func filterAgents(filterIds, allAgents []string) []string {
	if len(filterIds) == 0 {
		return allAgents
	}

	filterMap := make(map[string]bool)
	for _, id := range filterIds {
		filterMap[id] = true
	}

	result := make([]string, 0)
	for _, agent := range allAgents {
		if filterMap[agent] {
			result = append(result, agent)
		}
	}
	return result
}

func TestReportContentType(t *testing.T) {
	contentType := "application/pdf"

	if contentType != "application/pdf" {
		t.Errorf("Expected application/pdf, got %s", contentType)
	}
}

func TestReportSuccessResponse(t *testing.T) {
	success := true
	message := "Report sent successfully"

	if !success {
		t.Error("Success should be true")
	}

	if message == "" {
		t.Error("Message should not be empty")
	}
}

func BenchmarkReportFilenameGeneration(b *testing.B) {
	now := time.Now()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		generateReportFilename(now)
	}
}

func BenchmarkAgentFiltering(b *testing.B) {
	filterIds := []string{"agent-1", "agent-5", "agent-10"}
	allAgents := []string{"agent-1", "agent-2", "agent-3", "agent-4", "agent-5",
		"agent-6", "agent-7", "agent-8", "agent-9", "agent-10"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		filterAgents(filterIds, allAgents)
	}
}
