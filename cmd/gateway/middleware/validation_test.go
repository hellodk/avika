package middleware

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestValidator_ValidateRequired(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		expected bool
	}{
		{"non-empty", "value", true},
		{"empty", "", false},
		{"whitespace only", "   ", false},
		{"with whitespace", "  value  ", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateRequired("field", tt.value)
			if result != tt.expected {
				t.Errorf("ValidateRequired(%q) = %v, want %v", tt.value, result, tt.expected)
			}
			if tt.expected && v.HasErrors() {
				t.Error("Should not have errors for valid input")
			}
			if !tt.expected && !v.HasErrors() {
				t.Error("Should have errors for invalid input")
			}
		})
	}
}

func TestValidator_ValidateMaxLength(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		max      int
		expected bool
	}{
		{"within limit", "hello", 10, true},
		{"at limit", "hello", 5, true},
		{"exceeds limit", "hello world", 5, false},
		{"empty", "", 5, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateMaxLength("field", tt.value, tt.max)
			if result != tt.expected {
				t.Errorf("ValidateMaxLength(%q, %d) = %v, want %v", tt.value, tt.max, result, tt.expected)
			}
		})
	}
}

func TestValidator_ValidateMinLength(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		min      int
		expected bool
	}{
		{"above minimum", "hello world", 5, true},
		{"at minimum", "hello", 5, true},
		{"below minimum", "hi", 5, false},
		{"empty", "", 1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateMinLength("field", tt.value, tt.min)
			if result != tt.expected {
				t.Errorf("ValidateMinLength(%q, %d) = %v, want %v", tt.value, tt.min, result, tt.expected)
			}
		})
	}
}

func TestValidator_ValidateAgentID(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		expected bool
	}{
		{"valid simple", "agent-1", true},
		{"valid with dots", "server.prod.us-east-1", true},
		{"valid with underscores", "web_server_01", true},
		{"valid alphanumeric", "agent123", true},
		{"empty", "", false},
		{"starts with hyphen", "-agent", false},
		{"starts with dot", ".agent", false},
		{"contains spaces", "agent 1", false},
		{"special characters", "agent@host", false},
		{"too long", string(make([]byte, 200)), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateAgentID("agent_id", tt.value)
			if result != tt.expected {
				t.Errorf("ValidateAgentID(%q) = %v, want %v", tt.value, result, tt.expected)
			}
		})
	}
}

func TestValidator_ValidateTimeRange(t *testing.T) {
	now := time.Now().Unix()
	
	tests := []struct {
		name     string
		start    int64
		end      int64
		expected bool
	}{
		{"valid range", now - 3600, now, true},
		{"start after end", now, now - 3600, false},
		{"negative start", -1, now, false},
		{"negative end", now - 3600, -1, false},
		{"same time", now, now, true},
		{"exceeds 90 days", now - (91 * 24 * 60 * 60), now, false},
		{"exactly 90 days", now - (90 * 24 * 60 * 60), now, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateTimeRange(tt.start, tt.end)
			if result != tt.expected {
				t.Errorf("ValidateTimeRange(%d, %d) = %v, want %v", tt.start, tt.end, result, tt.expected)
			}
		})
	}
}

func TestValidator_ValidateIntRange(t *testing.T) {
	tests := []struct {
		name     string
		value    int
		min      int
		max      int
		expected bool
	}{
		{"within range", 5, 1, 10, true},
		{"at minimum", 1, 1, 10, true},
		{"at maximum", 10, 1, 10, true},
		{"below minimum", 0, 1, 10, false},
		{"above maximum", 11, 1, 10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewValidator()
			result := v.ValidateIntRange("field", tt.value, tt.min, tt.max)
			if result != tt.expected {
				t.Errorf("ValidateIntRange(%d, %d, %d) = %v, want %v", tt.value, tt.min, tt.max, result, tt.expected)
			}
		})
	}
}

func TestSanitizeString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"normal string", "hello world", "hello world"},
		{"with null byte", "hello\x00world", "helloworld"},
		{"with control chars", "hello\x01\x02world", "helloworld"},
		{"with tabs and newlines", "hello\t\nworld", "hello\t\nworld"}, // Tabs and newlines should be preserved
		{"empty", "", ""},
		{"unicode", "héllo wörld", "héllo wörld"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SanitizeString(tt.input)
			if result != tt.expected {
				t.Errorf("SanitizeString(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestSanitizeIdentifier(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"simple", "column_name", "column_name"},
		{"with numbers", "field123", "field123"},
		{"uppercase", "TableName", "TableName"},
		{"with hyphen", "table-name", "tablename"},
		{"with spaces", "table name", "tablename"},
		{"sql injection attempt", "name; DROP TABLE users;", "nameDROPTABLEusers"},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SanitizeIdentifier(tt.input)
			if result != tt.expected {
				t.Errorf("SanitizeIdentifier(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestValidQueryParams(t *testing.T) {
	now := time.Now().Unix()

	tests := []struct {
		name          string
		url           string
		expectStart   int64
		expectEnd     int64
		expectAgentID string
		expectErrors  bool
	}{
		{
			name:          "all valid params",
			url:           "/?start=1000&end=2000&agent_id=agent-1",
			expectStart:   1000,
			expectEnd:     2000,
			expectAgentID: "agent-1",
			expectErrors:  false,
		},
		{
			name:         "no params",
			url:          "/",
			expectErrors: false,
		},
		{
			name:         "invalid start",
			url:          "/?start=notanumber",
			expectErrors: true,
		},
		{
			name:         "invalid end",
			url:          "/?end=notanumber",
			expectErrors: true,
		},
		{
			name:          "invalid agent_id",
			url:           "/?agent_id=agent@invalid",
			expectErrors:  true,
		},
		{
			name:         "start after end",
			url:          "/?start=2000&end=1000",
			expectErrors: true,
		},
	}

	_ = now // Suppress unused warning

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			start, end, agentID, v := ValidQueryParams(req)

			if tt.expectErrors && !v.HasErrors() {
				t.Error("Expected validation errors")
			}
			if !tt.expectErrors && v.HasErrors() {
				t.Errorf("Unexpected errors: %v", v.Errors())
			}
			if !tt.expectErrors {
				if start != tt.expectStart {
					t.Errorf("start = %d, want %d", start, tt.expectStart)
				}
				if end != tt.expectEnd {
					t.Errorf("end = %d, want %d", end, tt.expectEnd)
				}
				if agentID != tt.expectAgentID {
					t.Errorf("agentID = %q, want %q", agentID, tt.expectAgentID)
				}
			}
		})
	}
}

func TestValidator_MultipleErrors(t *testing.T) {
	v := NewValidator()
	
	v.ValidateRequired("field1", "")
	v.ValidateRequired("field2", "")
	v.ValidateMaxLength("field3", "too long", 3)

	errors := v.Errors()
	if len(errors) != 3 {
		t.Errorf("Expected 3 errors, got %d", len(errors))
	}

	// Check that errors have correct fields
	fields := make(map[string]bool)
	for _, e := range errors {
		fields[e.Field] = true
	}

	for _, field := range []string{"field1", "field2", "field3"} {
		if !fields[field] {
			t.Errorf("Missing error for field %s", field)
		}
	}
}
