// Package middleware provides HTTP middleware for the gateway.
package middleware

import (
	"log"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a token bucket rate limiter per client IP.
type RateLimiter struct {
	mu       sync.RWMutex
	buckets  map[string]*tokenBucket
	rate     int           // tokens per second
	burst    int           // max burst size
	cleanup  time.Duration // cleanup interval
	stopCh   chan struct{}
}

type tokenBucket struct {
	tokens     float64
	lastUpdate time.Time
}

// NewRateLimiter creates a new rate limiter.
// rate: number of requests allowed per second
// burst: maximum number of requests in a burst
func NewRateLimiter(rate, burst int) *RateLimiter {
	rl := &RateLimiter{
		buckets: make(map[string]*tokenBucket),
		rate:    rate,
		burst:   burst,
		cleanup: 5 * time.Minute,
		stopCh:  make(chan struct{}),
	}
	go rl.cleanupLoop()
	return rl
}

// Allow checks if a request from the given IP should be allowed.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	bucket, exists := rl.buckets[ip]
	now := time.Now()

	if !exists {
		rl.buckets[ip] = &tokenBucket{
			tokens:     float64(rl.burst - 1), // consume one token
			lastUpdate: now,
		}
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(bucket.lastUpdate).Seconds()
	bucket.tokens += elapsed * float64(rl.rate)
	if bucket.tokens > float64(rl.burst) {
		bucket.tokens = float64(rl.burst)
	}
	bucket.lastUpdate = now

	if bucket.tokens >= 1 {
		bucket.tokens--
		return true
	}

	return false
}

// cleanupLoop removes stale entries periodically.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for ip, bucket := range rl.buckets {
				if now.Sub(bucket.lastUpdate) > rl.cleanup {
					delete(rl.buckets, ip)
				}
			}
			rl.mu.Unlock()
		case <-rl.stopCh:
			return
		}
	}
}

// Stop stops the rate limiter cleanup goroutine.
func (rl *RateLimiter) Stop() {
	close(rl.stopCh)
}

// RateLimitMiddleware wraps an HTTP handler with rate limiting.
func RateLimitMiddleware(limiter *RateLimiter, enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !enabled {
				next.ServeHTTP(w, r)
				return
			}

			ip := getClientIP(r)
			if !limiter.Allow(ip) {
				log.Printf("Rate limit exceeded for IP: %s", ip)
				w.Header().Set("Retry-After", "1")
				http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// getClientIP extracts the client IP from the request.
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP (original client)
		if i := len(xff); i > 0 {
			for j := 0; j < i; j++ {
				if xff[j] == ',' {
					return xff[:j]
				}
			}
			return xff
		}
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	return r.RemoteAddr
}
