package middleware

import (
	"context"
	"encoding/hex"
	"testing"
	"time"

	"google.golang.org/grpc/metadata"
)

// TestNewPSKManager tests PSK manager creation
func TestNewPSKManager(t *testing.T) {
	tests := []struct {
		name   string
		config PSKConfig
	}{
		{
			name:   "default config (disabled)",
			config: DefaultPSKConfig(),
		},
		{
			name: "enabled with explicit key",
			config: PSKConfig{
				Enabled:         true,
				Key:             "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				AllowAutoEnroll: true,
				TimestampWindow: 5 * time.Minute,
			},
		},
		{
			name: "enabled without key (auto-generate)",
			config: PSKConfig{
				Enabled:         true,
				Key:             "",
				AllowAutoEnroll: true,
				TimestampWindow: 5 * time.Minute,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := NewPSKManager(tt.config)
			if pm == nil {
				t.Fatal("NewPSKManager returned nil")
			}

			// If enabled without key, a key should be auto-generated
			if tt.config.Enabled && tt.config.Key == "" {
				gotKey := pm.GetPSK()
				if gotKey == "" {
					t.Error("PSK should be auto-generated when enabled and not provided")
				}
				// Should be 64 hex chars (32 bytes)
				if len(gotKey) != 64 {
					t.Errorf("Auto-generated PSK should be 64 chars, got %d", len(gotKey))
				}
			}
		})
	}
}

// TestComputeAgentSignature tests signature generation
func TestComputeAgentSignature(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	agentID := "nginx-prod-01"
	hostname := "server-1.example.com"

	sig1, ts1 := ComputeAgentSignature(psk, agentID, hostname)

	if sig1 == "" {
		t.Error("Signature should not be empty")
	}
	if ts1 == "" {
		t.Error("Timestamp should not be empty")
	}

	// Same inputs should produce different signatures due to timestamp
	time.Sleep(10 * time.Millisecond)
	sig2, ts2 := ComputeAgentSignature(psk, agentID, hostname)

	if ts1 == ts2 && sig1 == sig2 {
		t.Log("Same timestamp produced same signature (expected for same second)")
	}

	// Different agent ID should produce different signature
	sig3, _ := ComputeAgentSignature(psk, "different-agent", hostname)
	if sig1 == sig3 {
		t.Error("Different agent IDs should produce different signatures")
	}

	// Different PSK should produce different signature
	sig4, _ := ComputeAgentSignature("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", agentID, hostname)
	if sig1 == sig4 {
		t.Error("Different PSKs should produce different signatures")
	}
}

// TestValidateAgentAuth tests agent authentication validation
func TestValidateAgentAuth(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:          true,
		Key:              psk,
		AllowAutoEnroll:  true,
		TimestampWindow:  5 * time.Minute,
		RequireHostMatch: false,
	})

	agentID := "nginx-test-01"
	hostname := "test-server.local"

	// Generate valid signature
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	tests := []struct {
		name      string
		agentID   string
		hostname  string
		signature string
		timestamp string
		wantErr   bool
		errMsg    string
	}{
		{
			name:      "valid authentication",
			agentID:   agentID,
			hostname:  hostname,
			signature: signature,
			timestamp: timestamp,
			wantErr:   false,
		},
		{
			name:      "missing signature",
			agentID:   agentID,
			hostname:  hostname,
			signature: "",
			timestamp: timestamp,
			wantErr:   true,
			errMsg:    "missing authentication credentials",
		},
		{
			name:      "missing timestamp",
			agentID:   agentID,
			hostname:  hostname,
			signature: signature,
			timestamp: "",
			wantErr:   true,
			errMsg:    "missing authentication credentials",
		},
		{
			name:      "invalid timestamp format",
			agentID:   agentID,
			hostname:  hostname,
			signature: signature,
			timestamp: "not-a-timestamp",
			wantErr:   true,
			errMsg:    "invalid timestamp format",
		},
		{
			name:      "expired timestamp",
			agentID:   agentID,
			hostname:  hostname,
			signature: signature,
			timestamp: time.Now().Add(-10 * time.Minute).Format(time.RFC3339),
			wantErr:   true,
			errMsg:    "timestamp outside acceptable window",
		},
		{
			name:      "future timestamp",
			agentID:   agentID,
			hostname:  hostname,
			signature: signature,
			timestamp: time.Now().Add(10 * time.Minute).Format(time.RFC3339),
			wantErr:   true,
			errMsg:    "timestamp outside acceptable window",
		},
		{
			name:      "invalid signature",
			agentID:   agentID,
			hostname:  hostname,
			signature: "invalid-signature",
			timestamp: timestamp,
			wantErr:   true,
			errMsg:    "invalid signature",
		},
		{
			name:      "wrong agent ID in signature",
			agentID:   "wrong-agent",
			hostname:  hostname,
			signature: signature, // Signed for different agent
			timestamp: timestamp,
			wantErr:   true,
			errMsg:    "invalid signature",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := pm.ValidateAgentAuth(tt.agentID, tt.hostname, tt.signature, tt.timestamp)

			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateAgentAuth() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err != nil && tt.errMsg != "" {
				if !containsString(err.Error(), tt.errMsg) {
					t.Errorf("Error message should contain %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// TestValidateAgentAuth_Disabled tests that auth passes when PSK is disabled
func TestValidateAgentAuth_Disabled(t *testing.T) {
	pm := NewPSKManager(PSKConfig{
		Enabled: false,
	})

	// Should allow any request when disabled
	err := pm.ValidateAgentAuth("any-agent", "any-host", "", "")
	if err != nil {
		t.Errorf("PSK disabled should allow all requests, got error: %v", err)
	}
}

// TestAutoEnrollment tests automatic agent registration
func TestAutoEnrollment(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: true,
		TimestampWindow: 5 * time.Minute,
	})

	agentID := "new-agent-01"
	hostname := "new-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// First connection should auto-enroll
	err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err != nil {
		t.Errorf("Auto-enrollment should succeed: %v", err)
	}

	// Agent should now be registered
	agents := pm.ListAgents()
	found := false
	for _, a := range agents {
		if a.AgentID == agentID {
			found = true
			if !a.Approved {
				t.Error("Auto-enrolled agent should be approved")
			}
			break
		}
	}
	if !found {
		t.Error("Agent should be in registered list after auto-enrollment")
	}
}

// TestManualEnrollment tests manual agent registration mode
func TestManualEnrollment(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: false, // Manual mode
		TimestampWindow: 5 * time.Minute,
	})

	agentID := "manual-agent-01"
	hostname := "manual-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// First connection should fail (not registered)
	err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err == nil {
		t.Error("Unregistered agent should be rejected in manual mode")
	}

	// Register the agent
	pm.RegisterAgent(agentID, hostname, true)

	// Generate new signature with current timestamp
	signature, timestamp = ComputeAgentSignature(psk, agentID, hostname)

	// Now it should succeed
	err = pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err != nil {
		t.Errorf("Registered agent should be allowed: %v", err)
	}
}

// TestPendingApproval tests agents registered but pending approval
func TestPendingApproval(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: false,
		TimestampWindow: 5 * time.Minute,
	})

	agentID := "pending-agent-01"
	hostname := "pending-server.local"

	// Register but don't approve
	pm.RegisterAgent(agentID, hostname, false)

	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// Should fail (pending approval)
	err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err == nil {
		t.Error("Pending approval agent should be rejected")
	}
	if !containsString(err.Error(), "pending approval") {
		t.Errorf("Error should mention pending approval, got: %v", err)
	}

	// Approve the agent
	if err := pm.ApproveAgent(agentID); err != nil {
		t.Errorf("ApproveAgent failed: %v", err)
	}

	// Generate new signature
	signature, timestamp = ComputeAgentSignature(psk, agentID, hostname)

	// Now it should succeed
	err = pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err != nil {
		t.Errorf("Approved agent should be allowed: %v", err)
	}
}

// TestRevokeAgent tests agent revocation
func TestRevokeAgent(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: true,
		TimestampWindow: 5 * time.Minute,
	})

	agentID := "revoke-test-01"
	hostname := "revoke-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// Auto-enroll
	pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)

	// Verify enrolled
	agents := pm.ListAgents()
	if len(agents) == 0 {
		t.Fatal("Agent should be enrolled")
	}

	// Revoke
	if err := pm.RevokeAgent(agentID); err != nil {
		t.Errorf("RevokeAgent failed: %v", err)
	}

	// Verify revoked
	agents = pm.ListAgents()
	for _, a := range agents {
		if a.AgentID == agentID {
			t.Error("Revoked agent should not be in list")
		}
	}
}

// TestHostnameMatch tests the hostname matching requirement
func TestHostnameMatch(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:          true,
		Key:              psk,
		AllowAutoEnroll:  true,
		TimestampWindow:  5 * time.Minute,
		RequireHostMatch: true,
	})

	agentID := "hostname-test-01"
	hostname := "original-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// First enrollment with original hostname
	err := pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)
	if err != nil {
		t.Errorf("Initial enrollment should succeed: %v", err)
	}

	// Try with different hostname - should generate new signature too
	newHostname := "different-server.local"
	newSignature, newTimestamp := ComputeAgentSignature(psk, agentID, newHostname)

	err = pm.ValidateAgentAuth(agentID, newHostname, newSignature, newTimestamp)
	if err == nil {
		t.Error("Different hostname should be rejected when RequireHostMatch=true")
	}
	if !containsString(err.Error(), "hostname mismatch") {
		t.Errorf("Error should mention hostname mismatch, got: %v", err)
	}
}

// TestListAgents tests agent listing
func TestListAgents(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: true,
		TimestampWindow: 5 * time.Minute,
	})

	// Register multiple agents
	agents := []struct {
		id   string
		host string
	}{
		{"agent-1", "server-1.local"},
		{"agent-2", "server-2.local"},
		{"agent-3", "server-3.local"},
	}

	for _, a := range agents {
		sig, ts := ComputeAgentSignature(psk, a.id, a.host)
		pm.ValidateAgentAuth(a.id, a.host, sig, ts)
	}

	// List should have all agents
	list := pm.ListAgents()
	if len(list) != len(agents) {
		t.Errorf("Expected %d agents, got %d", len(agents), len(list))
	}

	// Verify each agent is in the list
	for _, expected := range agents {
		found := false
		for _, got := range list {
			if got.AgentID == expected.id {
				found = true
				if got.Hostname != expected.host {
					t.Errorf("Agent %s hostname mismatch: expected %s, got %s",
						expected.id, expected.host, got.Hostname)
				}
				break
			}
		}
		if !found {
			t.Errorf("Agent %s not found in list", expected.id)
		}
	}
}

// TestGetMetadataValue tests gRPC metadata extraction
func TestGetMetadataValue(t *testing.T) {
	tests := []struct {
		name     string
		md       metadata.MD
		key      string
		expected string
	}{
		{
			name:     "existing key",
			md:       metadata.Pairs("x-avika-agent-id", "test-agent"),
			key:      "x-avika-agent-id",
			expected: "test-agent",
		},
		{
			name:     "missing key",
			md:       metadata.Pairs("other-key", "value"),
			key:      "x-avika-agent-id",
			expected: "",
		},
		{
			name:     "multiple values (returns first)",
			md:       metadata.Pairs("x-key", "first", "x-key", "second"),
			key:      "x-key",
			expected: "first",
		},
		{
			name:     "case insensitive (gRPC lowercases)",
			md:       metadata.Pairs("X-AVIKA-AGENT-ID", "test-agent"),
			key:      "x-avika-agent-id",
			expected: "test-agent",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getMetadataValue(tt.md, tt.key)
			if got != tt.expected {
				t.Errorf("getMetadataValue() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// TestUnaryPSKInterceptor tests the gRPC unary interceptor
func TestUnaryPSKInterceptor(t *testing.T) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: true,
		TimestampWindow: 5 * time.Minute,
	})

	interceptor := pm.UnaryPSKInterceptor()

	agentID := "grpc-agent-01"
	hostname := "grpc-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// Mock handler that should be called if auth succeeds
	called := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		called = true
		return "success", nil
	}

	t.Run("valid authentication", func(t *testing.T) {
		called = false
		md := metadata.Pairs(
			PSKAgentIDKey, agentID,
			PSKHostnameKey, hostname,
			PSKSignatureKey, signature,
			PSKTimestampKey, timestamp,
		)
		ctx := metadata.NewIncomingContext(context.Background(), md)

		_, err := interceptor(ctx, nil, nil, handler)
		if err != nil {
			t.Errorf("Valid auth should succeed: %v", err)
		}
		if !called {
			t.Error("Handler should have been called")
		}
	})

	t.Run("missing metadata", func(t *testing.T) {
		called = false
		ctx := context.Background() // No metadata

		_, err := interceptor(ctx, nil, nil, handler)
		if err == nil {
			t.Error("Missing metadata should fail")
		}
		if called {
			t.Error("Handler should not be called on auth failure")
		}
	})

	t.Run("invalid signature", func(t *testing.T) {
		called = false
		md := metadata.Pairs(
			PSKAgentIDKey, agentID,
			PSKHostnameKey, hostname,
			PSKSignatureKey, "invalid-signature",
			PSKTimestampKey, timestamp,
		)
		ctx := metadata.NewIncomingContext(context.Background(), md)

		_, err := interceptor(ctx, nil, nil, handler)
		if err == nil {
			t.Error("Invalid signature should fail")
		}
		if called {
			t.Error("Handler should not be called on auth failure")
		}
	})
}

// TestUnaryPSKInterceptor_Disabled tests interceptor when PSK is disabled
func TestUnaryPSKInterceptor_Disabled(t *testing.T) {
	pm := NewPSKManager(PSKConfig{
		Enabled: false,
	})

	interceptor := pm.UnaryPSKInterceptor()

	called := false
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		called = true
		return "success", nil
	}

	ctx := context.Background() // No metadata at all

	_, err := interceptor(ctx, nil, nil, handler)
	if err != nil {
		t.Errorf("Disabled PSK should pass all requests: %v", err)
	}
	if !called {
		t.Error("Handler should be called when PSK is disabled")
	}
}

// TestIsEnabled tests the IsEnabled method
func TestPSKIsEnabled(t *testing.T) {
	t.Run("enabled", func(t *testing.T) {
		pm := NewPSKManager(PSKConfig{
			Enabled: true,
			Key:     "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		})
		if !pm.IsEnabled() {
			t.Error("Expected IsEnabled to be true")
		}
	})

	t.Run("disabled", func(t *testing.T) {
		pm := NewPSKManager(PSKConfig{
			Enabled: false,
		})
		if pm.IsEnabled() {
			t.Error("Expected IsEnabled to be false")
		}
	})
}

// TestDefaultPSKConfig tests the default configuration
func TestDefaultPSKConfig(t *testing.T) {
	cfg := DefaultPSKConfig()

	if cfg.Enabled {
		t.Error("Default PSK should be disabled")
	}
	if cfg.Key != "" {
		t.Error("Default key should be empty")
	}
	if !cfg.AllowAutoEnroll {
		t.Error("Default should allow auto-enrollment")
	}
	if cfg.TimestampWindow != 5*time.Minute {
		t.Errorf("Default timestamp window should be 5m, got %v", cfg.TimestampWindow)
	}
	if cfg.RequireHostMatch {
		t.Error("Default should not require host match")
	}
}

// BenchmarkComputeSignature benchmarks signature computation
func BenchmarkComputeSignature(b *testing.B) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	agentID := "bench-agent"
	hostname := "bench-server.local"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ComputeAgentSignature(psk, agentID, hostname)
	}
}

// BenchmarkValidateAuth benchmarks authentication validation
func BenchmarkValidateAuth(b *testing.B) {
	psk := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	pm := NewPSKManager(PSKConfig{
		Enabled:         true,
		Key:             psk,
		AllowAutoEnroll: true,
		TimestampWindow: 5 * time.Minute,
	})

	agentID := "bench-agent"
	hostname := "bench-server.local"
	signature, timestamp := ComputeAgentSignature(psk, agentID, hostname)

	// Pre-enroll agent
	pm.ValidateAgentAuth(agentID, hostname, signature, timestamp)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Generate fresh signature each time (simulates real usage)
		sig, ts := ComputeAgentSignature(psk, agentID, hostname)
		pm.ValidateAgentAuth(agentID, hostname, sig, ts)
	}
}

// Helper function to check if a string contains a substring
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// TestPSKKeyFormat validates PSK key format
func TestPSKKeyFormat(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		wantHexErr bool  // hex.DecodeString error
		wantLen    int   // expected decoded length (0 = don't check)
		wantValid  bool  // is this a valid PSK for our purposes (32 bytes)
	}{
		{
			name:       "valid 64-char hex (32 bytes)",
			key:        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			wantHexErr: false,
			wantLen:    32,
			wantValid:  true,
		},
		{
			name:       "valid uppercase hex",
			key:        "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
			wantHexErr: false,
			wantLen:    32,
			wantValid:  true,
		},
		{
			name:       "too short - 16 chars (8 bytes)",
			key:        "0123456789abcdef",
			wantHexErr: false, // hex decoding succeeds
			wantLen:    8,
			wantValid:  false, // but not valid for our PSK (needs 32 bytes)
		},
		{
			name:       "invalid - non-hex chars",
			key:        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
			wantHexErr: true,
			wantValid:  false,
		},
		{
			name:       "invalid - odd length",
			key:        "0123456789abcde", // 15 chars
			wantHexErr: true,              // hex requires even length
			wantValid:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decoded, err := hex.DecodeString(tt.key)
			gotHexErr := err != nil

			if gotHexErr != tt.wantHexErr {
				t.Errorf("hex.DecodeString(%q) error = %v, wantErr %v", tt.key, err, tt.wantHexErr)
			}

			if !gotHexErr && tt.wantLen > 0 {
				if len(decoded) != tt.wantLen {
					t.Errorf("decoded length = %d, want %d", len(decoded), tt.wantLen)
				}
			}

			// Check if it's a valid PSK (must be 32 bytes = 64 hex chars)
			isValid := !gotHexErr && len(decoded) == 32
			if isValid != tt.wantValid {
				t.Errorf("isValidPSK = %v, want %v", isValid, tt.wantValid)
			}
		})
	}
}
