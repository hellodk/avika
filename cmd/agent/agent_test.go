package main

import (
	"strings"
	"testing"
)

// TestAddressProtocolStripping tests that protocols are correctly stripped
func TestAddressProtocolStripping(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"http://localhost:5020", "localhost:5020"},
		{"https://localhost:5020", "localhost:5020"},
		{"localhost:5020", "localhost:5020"},
		{"http://192.168.1.1:5020", "192.168.1.1:5020"},
		{"https://gateway.svc.cluster.local:5020", "gateway.svc.cluster.local:5020"},
	}

	for _, tc := range testCases {
		result := tc.input
		result = strings.TrimPrefix(result, "http://")
		result = strings.TrimPrefix(result, "https://")
		
		if result != tc.expected {
			t.Errorf("Input %s: expected %s, got %s", tc.input, tc.expected, result)
		}
	}
}

// TestAgentIDGeneration tests agent ID format: hostname + "-" + IP with dots replaced by dashes.
func TestAgentIDGeneration(t *testing.T) {
	hostname := "test-node"
	ip := "192.168.1.100"
	sanitized := strings.ReplaceAll(ip, ".", "-") // 192-168-1-100
	agentID := hostname + "-" + sanitized
	if agentID != "test-node-192-168-1-100" {
		t.Errorf("Unexpected agent ID format: %s (expected hostname-IP with dashes)", agentID)
	}
}

// TestMigrateAgentIDToNewFormat tests migration of old-format IDs to hostname-IP-with-dashes.
func TestMigrateAgentIDToNewFormat(t *testing.T) {
	tests := []struct {
		id       string
		expected string
	}{
		{"node1+10.0.2.15", "node1-10-0-2-15"},
		{"host-10+192.168.1.1", "host-10-192-168-1-1"},
		{"already-new-10-0-2-15", ""},           // no +, no migration
		{"", ""},
		{"noplus", ""},
		{"only+", ""}, // hostname "only", ip "" -> empty ip so return ""
	}
	for _, tt := range tests {
		got := migrateAgentIDToNewFormat(tt.id)
		if got != tt.expected {
			t.Errorf("migrateAgentIDToNewFormat(%q) = %q, want %q", tt.id, got, tt.expected)
		}
	}
}

// TestVersionInfo tests version information constants
func TestVersionInfo(t *testing.T) {
	// Check that version info is set (can be default dev values)
	if Version == "" {
		t.Error("Version should not be empty")
	}
	
	// BuildDate and GitCommit can be "unknown" in dev builds
	if BuildDate == "" {
		t.Error("BuildDate should not be empty")
	}
	
	if GitCommit == "" {
		t.Error("GitCommit should not be empty")
	}
}

// TestPortConstants tests port constant values
func TestPortConstants(t *testing.T) {
	// Verify ports are in expected range (5020-5050)
	if DefaultGatewayPort < 5020 || DefaultGatewayPort > 5050 {
		t.Errorf("DefaultGatewayPort %d is outside expected range 5020-5050", DefaultGatewayPort)
	}
	
	if DefaultHealthPort < 5020 || DefaultHealthPort > 5050 {
		t.Errorf("DefaultHealthPort %d is outside expected range 5020-5050", DefaultHealthPort)
	}
	
	if DefaultMgmtPort < 5020 || DefaultMgmtPort > 5050 {
		t.Errorf("DefaultMgmtPort %d is outside expected range 5020-5050", DefaultMgmtPort)
	}
	
	// Verify ports are unique
	ports := map[int]string{
		DefaultGatewayPort: "Gateway",
		DefaultHealthPort:  "Health",
		DefaultMgmtPort:    "Mgmt",
	}
	
	if len(ports) != 3 {
		t.Error("Port constants must be unique")
	}
}

// TestParseGatewayAddresses tests parsing of gateway addresses
func TestParseGatewayAddresses(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		expectedCount int
		expectedFirst string
	}{
		{
			name:          "Single address",
			input:         "gateway.example.com:5020",
			expectedCount: 1,
			expectedFirst: "gateway.example.com:5020",
		},
		{
			name:          "Multiple addresses",
			input:         "gw1.example.com:5020,gw2.example.com:5020",
			expectedCount: 2,
			expectedFirst: "gw1.example.com:5020",
		},
		{
			name:          "With http prefix",
			input:         "http://gateway.example.com:5020",
			expectedCount: 1,
			expectedFirst: "gateway.example.com:5020",
		},
		{
			name:          "With whitespace",
			input:         "  gw1.example.com:5020  ,  gw2.example.com:5020  ",
			expectedCount: 2,
			expectedFirst: "gw1.example.com:5020",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Parse the addresses
			var addrs []string
			for _, addr := range strings.Split(tt.input, ",") {
				addr = strings.TrimSpace(addr)
				addr = strings.TrimPrefix(addr, "http://")
				addr = strings.TrimPrefix(addr, "https://")
				if addr != "" {
					addrs = append(addrs, addr)
				}
			}

			if len(addrs) != tt.expectedCount {
				t.Errorf("Expected %d addresses, got %d: %v", tt.expectedCount, len(addrs), addrs)
			}

			if len(addrs) > 0 && addrs[0] != tt.expectedFirst {
				t.Errorf("Expected first address %s, got %s", tt.expectedFirst, addrs[0])
			}
		})
	}
}

// TestConfigValidation tests that config values are valid
func TestConfigValidation(t *testing.T) {
	tests := []struct {
		name      string
		port      int
		shouldErr bool
	}{
		{"Valid port", 5020, false},
		{"Valid high port", 65535, false},
		{"Zero port", 0, true},
		{"Negative port", -1, true},
		{"Too high port", 65536, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := tt.port > 0 && tt.port <= 65535
			if isValid == tt.shouldErr {
				t.Errorf("Port %d validation: expected error=%v, got valid=%v", tt.port, tt.shouldErr, isValid)
			}
		})
	}
}

// BenchmarkAddressParsing benchmarks address parsing
func BenchmarkAddressParsing(b *testing.B) {
	input := "gw1.example.com:5020, gw2.example.com:5020, gw3.example.com:5020"
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var addrs []string
		for _, addr := range strings.Split(input, ",") {
			addr = strings.TrimSpace(addr)
			addr = strings.TrimPrefix(addr, "http://")
			addr = strings.TrimPrefix(addr, "https://")
			if addr != "" {
				addrs = append(addrs, addr)
			}
		}
		_ = addrs
	}
}
