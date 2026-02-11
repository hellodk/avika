package health

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// Server provides HTTP health check endpoints
type Server struct {
	server *http.Server
	ready  bool
	mu     sync.RWMutex
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Uptime    string    `json:"uptime,omitempty"`
}

// NewServer creates a new health check server
func NewServer(port int) *Server {
	s := &Server{
		ready: false,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.livenessHandler)
	mux.HandleFunc("/readyz", s.readinessHandler)

	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

// Start starts the health check server
func (s *Server) Start() error {
	log.Printf("Starting health check server on %s", s.server.Addr)
	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("health server error: %w", err)
	}
	return nil
}

// Shutdown gracefully shuts down the health check server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Shutting down health check server...")
	return s.server.Shutdown(ctx)
}

// SetReady marks the service as ready
func (s *Server) SetReady(ready bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ready = ready
}

// livenessHandler handles /healthz endpoint (liveness probe)
func (s *Server) livenessHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	resp := HealthResponse{
		Status:    "alive",
		Timestamp: time.Now(),
	}

	json.NewEncoder(w).Encode(resp)
}

// readinessHandler handles /readyz endpoint (readiness probe)
func (s *Server) readinessHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	ready := s.ready
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")

	if ready {
		w.WriteHeader(http.StatusOK)
		resp := HealthResponse{
			Status:    "ready",
			Timestamp: time.Now(),
		}
		json.NewEncoder(w).Encode(resp)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
		resp := HealthResponse{
			Status:    "not ready",
			Timestamp: time.Now(),
		}
		json.NewEncoder(w).Encode(resp)
	}
}
