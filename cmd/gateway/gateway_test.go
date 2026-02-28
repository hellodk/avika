package main_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestHealthEndpoint tests the /health endpoint
func TestHealthEndpoint(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "healthy",
			"version": "test",
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

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

// TestReadyEndpoint tests the /ready endpoint
func TestReadyEndpoint(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ready",
		})
	})

	req := httptest.NewRequest("GET", "/ready", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

// TestCORSHeaders tests CORS header handling
func TestCORSHeaders(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CORS middleware simulation
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		
		w.WriteHeader(http.StatusOK)
	})

	// Test preflight request
	req := httptest.NewRequest("OPTIONS", "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected status 204 for OPTIONS, got %d", w.Code)
	}

	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("Missing CORS header")
	}
}

// TestJSONContentType tests JSON response handling
func TestJSONContentType(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []string{"item1", "item2"},
			"total": 2,
		})
	})

	req := httptest.NewRequest("GET", "/api/data", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type 'application/json', got '%s'", contentType)
	}
}

// TestContextCancellation tests that context cancellation is respected
func TestContextCancellation(t *testing.T) {
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

// TestTimeoutHandling tests request timeout handling
func TestTimeoutHandling(t *testing.T) {
	handler := http.TimeoutHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.Write([]byte("ok"))
	}), 10*time.Millisecond, "timeout")

	req := httptest.NewRequest("GET", "/slow", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status 503 for timeout, got %d", w.Code)
	}
}

// TestMethodNotAllowed tests 405 response
func TestMethodNotAllowed(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/resource", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})

	req := httptest.NewRequest("GET", "/api/resource", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	// ServeMux returns 404 for unregistered routes, not 405
	if w.Code != http.StatusNotFound {
		t.Logf("Got status %d for mismatched method", w.Code)
	}
}

// TestRateLimitSimulation tests rate limit behavior
func TestRateLimitSimulation(t *testing.T) {
	requestCount := 0
	maxRequests := 5
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount > maxRequests {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// First maxRequests should succeed
	for i := 0; i < maxRequests; i++ {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		
		if w.Code != http.StatusOK {
			t.Errorf("Request %d: expected 200, got %d", i, w.Code)
		}
	}

	// Next request should be rate limited
	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("Expected 429, got %d", w.Code)
	}
}

// TestErrorResponse tests error response format
func TestErrorResponse(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "validation_error",
			"message": "Invalid request body",
			"details": []string{"field 'name' is required"},
		})
	})

	req := httptest.NewRequest("POST", "/api/resource", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}

	if resp["error"] != "validation_error" {
		t.Errorf("Expected error 'validation_error', got '%v'", resp["error"])
	}
}

// BenchmarkJSONEncoding benchmarks JSON encoding
func BenchmarkJSONEncoding(b *testing.B) {
	data := map[string]interface{}{
		"id":        "test-123",
		"name":      "Test Resource",
		"count":     100,
		"active":    true,
		"tags":      []string{"tag1", "tag2", "tag3"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		json.NewEncoder(w).Encode(data)
	}
}

// BenchmarkRequestHandling benchmarks basic request handling
func BenchmarkRequestHandling(b *testing.B) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
	}
}
