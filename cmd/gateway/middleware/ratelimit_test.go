package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_Allow(t *testing.T) {
	limiter := NewRateLimiter(10, 5) // 10 RPS, burst of 5
	defer limiter.Stop()

	ip := "192.168.1.1"

	// First 5 requests should be allowed (burst)
	for i := 0; i < 5; i++ {
		if !limiter.Allow(ip) {
			t.Errorf("Request %d should be allowed within burst", i+1)
		}
	}

	// 6th request should be denied (exceeded burst)
	if limiter.Allow(ip) {
		t.Error("6th request should be denied after burst exceeded")
	}
}

func TestRateLimiter_Refill(t *testing.T) {
	limiter := NewRateLimiter(100, 2) // 100 RPS, burst of 2
	defer limiter.Stop()

	ip := "192.168.1.2"

	// Exhaust the burst
	limiter.Allow(ip)
	limiter.Allow(ip)

	// Should be denied
	if limiter.Allow(ip) {
		t.Error("Should be denied after burst")
	}

	// Wait for refill (at 100 RPS, 1 token in 10ms)
	time.Sleep(15 * time.Millisecond)

	// Should be allowed after refill
	if !limiter.Allow(ip) {
		t.Error("Should be allowed after refill")
	}
}

func TestRateLimiter_MultipleIPs(t *testing.T) {
	limiter := NewRateLimiter(10, 2)
	defer limiter.Stop()

	ip1 := "192.168.1.1"
	ip2 := "192.168.1.2"

	// Exhaust IP1's burst
	limiter.Allow(ip1)
	limiter.Allow(ip1)

	// IP1 should be denied
	if limiter.Allow(ip1) {
		t.Error("IP1 should be denied")
	}

	// IP2 should still be allowed (separate bucket)
	if !limiter.Allow(ip2) {
		t.Error("IP2 should be allowed")
	}
}

func TestRateLimitMiddleware_Enabled(t *testing.T) {
	limiter := NewRateLimiter(10, 1) // 1 request burst for easy testing
	defer limiter.Stop()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := RateLimitMiddleware(limiter, true)(handler)

	// First request should succeed
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "192.168.1.1:12345"
	rec1 := httptest.NewRecorder()
	middleware.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rec1.Code)
	}

	// Second request should be rate limited
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.1:12345"
	rec2 := httptest.NewRecorder()
	middleware.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("Expected 429, got %d", rec2.Code)
	}
}

func TestRateLimitMiddleware_Disabled(t *testing.T) {
	limiter := NewRateLimiter(1, 1)
	defer limiter.Stop()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := RateLimitMiddleware(limiter, false)(handler) // Disabled

	// All requests should succeed when disabled
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()
		middleware.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("Request %d: Expected 200, got %d", i+1, rec.Code)
		}
	}
}

func TestGetClientIP(t *testing.T) {
	tests := []struct {
		name       string
		xff        string
		xri        string
		remoteAddr string
		expected   string
	}{
		{
			name:       "X-Forwarded-For single IP",
			xff:        "10.0.0.1",
			expected:   "10.0.0.1",
			remoteAddr: "192.168.1.1:12345",
		},
		{
			name:       "X-Forwarded-For multiple IPs",
			xff:        "10.0.0.1, 10.0.0.2, 10.0.0.3",
			expected:   "10.0.0.1",
			remoteAddr: "192.168.1.1:12345",
		},
		{
			name:       "X-Real-IP",
			xri:        "10.0.0.1",
			expected:   "10.0.0.1",
			remoteAddr: "192.168.1.1:12345",
		},
		{
			name:       "RemoteAddr fallback",
			expected:   "192.168.1.1:12345",
			remoteAddr: "192.168.1.1:12345",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.xff != "" {
				req.Header.Set("X-Forwarded-For", tt.xff)
			}
			if tt.xri != "" {
				req.Header.Set("X-Real-IP", tt.xri)
			}

			got := getClientIP(req)
			if got != tt.expected {
				t.Errorf("getClientIP() = %v, want %v", got, tt.expected)
			}
		})
	}
}
