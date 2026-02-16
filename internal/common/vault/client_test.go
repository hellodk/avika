package vault

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestNewClient tests Vault client creation
func TestNewClient(t *testing.T) {
	client, err := NewClient(Config{
		Address: "http://localhost:8200",
		Token:   "test-token",
	})

	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	if client.addr != "http://localhost:8200" {
		t.Errorf("Expected address 'http://localhost:8200', got '%s'", client.addr)
	}

	if client.token != "test-token" {
		t.Errorf("Expected token 'test-token', got '%s'", client.token)
	}
}

// TestNewClientDefaults tests default configuration
func TestNewClientDefaults(t *testing.T) {
	// This will use env vars or defaults
	client, err := NewClient(Config{})
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	// Should have some address
	if client.addr == "" {
		t.Error("Client address should not be empty")
	}

	// Default timeout should be set
	if client.client.Timeout != 30*time.Second {
		t.Errorf("Expected timeout 30s, got %v", client.client.Timeout)
	}
}

// TestGetSecret tests secret retrieval
func TestGetSecret(t *testing.T) {
	// Create a mock Vault server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check request
		if r.URL.Path != "/v1/secret/data/test-path" {
			t.Errorf("Unexpected path: %s", r.URL.Path)
		}

		if r.Header.Get("X-Vault-Token") != "test-token" {
			t.Error("Missing or incorrect token")
		}

		// Return mock response
		resp := VaultResponse{
			RequestID: "test-request-id",
		}
		resp.Data.Data = SecretData{
			"username": "testuser",
			"password": "testpass",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	secret, err := client.GetSecret("test-path")
	if err != nil {
		t.Fatalf("Failed to get secret: %v", err)
	}

	if secret["username"] != "testuser" {
		t.Errorf("Expected username 'testuser', got '%v'", secret["username"])
	}

	if secret["password"] != "testpass" {
		t.Errorf("Expected password 'testpass', got '%v'", secret["password"])
	}
}

// TestGetSecretNotFound tests 404 handling
func TestGetSecretNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	_, err := client.GetSecret("nonexistent")
	if err == nil {
		t.Error("Expected error for non-existent secret")
	}
}

// TestGetString tests string value retrieval
func TestGetString(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{
			RequestID: "test",
		}
		resp.Data.Data = SecretData{
			"key1": "value1",
			"key2": 123, // Not a string
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	// Test valid string
	val, err := client.GetString("test", "key1")
	if err != nil {
		t.Fatalf("Failed to get string: %v", err)
	}
	if val != "value1" {
		t.Errorf("Expected 'value1', got '%s'", val)
	}

	// Test missing key
	_, err = client.GetString("test", "nonexistent")
	if err == nil {
		t.Error("Expected error for missing key")
	}
}

// TestIsAvailable tests health check
func TestIsAvailable(t *testing.T) {
	// Healthy server
	healthyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sys/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
	}))
	defer healthyServer.Close()

	client, _ := NewClient(Config{
		Address: healthyServer.URL,
		Token:   "test-token",
	})

	if !client.IsAvailable() {
		t.Error("Expected server to be available")
	}

	// Unhealthy server (sealed)
	unhealthyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer unhealthyServer.Close()

	client2, _ := NewClient(Config{
		Address: unhealthyServer.URL,
		Token:   "test-token",
	})

	if client2.IsAvailable() {
		t.Error("Expected server to be unavailable")
	}
}

// TestGetPostgresConfig tests PostgreSQL config retrieval
func TestGetPostgresConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{
			RequestID: "test",
		}
		resp.Data.Data = SecretData{
			"host":     "postgres.default.svc",
			"port":     "5432",
			"database": "mydb",
			"username": "admin",
			"password": "secret",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	cfg, err := client.GetPostgresConfig()
	if err != nil {
		t.Fatalf("Failed to get postgres config: %v", err)
	}

	if cfg.Host != "postgres.default.svc" {
		t.Errorf("Expected host 'postgres.default.svc', got '%s'", cfg.Host)
	}

	if cfg.Port != "5432" {
		t.Errorf("Expected port '5432', got '%s'", cfg.Port)
	}

	if cfg.Database != "mydb" {
		t.Errorf("Expected database 'mydb', got '%s'", cfg.Database)
	}
}

// TestGetPostgresDSN tests DSN generation
func TestGetPostgresDSN(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{
			RequestID: "test",
		}
		resp.Data.Data = SecretData{
			"host":     "localhost",
			"port":     "5432",
			"database": "testdb",
			"username": "user",
			"password": "pass",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	dsn, err := client.GetPostgresDSN()
	if err != nil {
		t.Fatalf("Failed to get DSN: %v", err)
	}

	expected := "postgres://user:pass@localhost:5432/testdb?sslmode=disable"
	if dsn != expected {
		t.Errorf("Expected DSN '%s', got '%s'", expected, dsn)
	}
}

// TestGetClickHouseConfig tests ClickHouse config retrieval
func TestGetClickHouseConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{
			RequestID: "test",
		}
		resp.Data.Data = SecretData{
			"host":      "clickhouse.default.svc",
			"port":      "9000",
			"http_port": "8123",
			"database":  "analytics",
			"username":  "default",
			"password":  "",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	cfg, err := client.GetClickHouseConfig()
	if err != nil {
		t.Fatalf("Failed to get clickhouse config: %v", err)
	}

	if cfg.Host != "clickhouse.default.svc" {
		t.Errorf("Expected host 'clickhouse.default.svc', got '%s'", cfg.Host)
	}

	if cfg.Port != "9000" {
		t.Errorf("Expected port '9000', got '%s'", cfg.Port)
	}
}

// TestGetRedpandaConfig tests Redpanda/Kafka config retrieval
func TestGetRedpandaConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{
			RequestID: "test",
		}
		resp.Data.Data = SecretData{
			"brokers": "redpanda-0:9092,redpanda-1:9092",
			"topic":   "events",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	cfg, err := client.GetRedpandaConfig()
	if err != nil {
		t.Fatalf("Failed to get redpanda config: %v", err)
	}

	if cfg.Brokers != "redpanda-0:9092,redpanda-1:9092" {
		t.Errorf("Expected brokers 'redpanda-0:9092,redpanda-1:9092', got '%s'", cfg.Brokers)
	}

	if cfg.Topic != "events" {
		t.Errorf("Expected topic 'events', got '%s'", cfg.Topic)
	}
}

// BenchmarkGetSecret benchmarks secret retrieval
func BenchmarkGetSecret(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := VaultResponse{RequestID: "test"}
		resp.Data.Data = SecretData{"key": "value"}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, _ := NewClient(Config{
		Address: server.URL,
		Token:   "test-token",
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = client.GetSecret("test")
	}
}
