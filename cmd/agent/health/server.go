package health

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	_ "net/http/pprof" // Register pprof handlers
	"runtime"
	"sync"
	"time"
)

// Server provides HTTP health check endpoints
type Server struct {
	server    *http.Server
	ready     bool
	mu        sync.RWMutex
	startTime time.Time
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Uptime    string    `json:"uptime,omitempty"`
}

// RuntimeStats contains runtime statistics for profiling
type RuntimeStats struct {
	Timestamp       time.Time `json:"timestamp"`
	Uptime          string    `json:"uptime"`
	UptimeSeconds   float64   `json:"uptime_seconds"`
	Goroutines      int       `json:"goroutines"`
	NumCPU          int       `json:"num_cpu"`
	GOMAXPROCS      int       `json:"gomaxprocs"`
	CGOCalls        int64     `json:"cgo_calls"`
	Memory          MemStats  `json:"memory"`
	GC              GCStats   `json:"gc"`
}

// MemStats contains memory statistics
type MemStats struct {
	AllocBytes      uint64  `json:"alloc_bytes"`
	AllocMB         float64 `json:"alloc_mb"`
	TotalAllocBytes uint64  `json:"total_alloc_bytes"`
	TotalAllocMB    float64 `json:"total_alloc_mb"`
	SysBytes        uint64  `json:"sys_bytes"`
	SysMB           float64 `json:"sys_mb"`
	HeapAllocBytes  uint64  `json:"heap_alloc_bytes"`
	HeapAllocMB     float64 `json:"heap_alloc_mb"`
	HeapSysBytes    uint64  `json:"heap_sys_bytes"`
	HeapSysMB       float64 `json:"heap_sys_mb"`
	HeapObjects     uint64  `json:"heap_objects"`
	StackInuseBytes uint64  `json:"stack_inuse_bytes"`
	StackSysBytes   uint64  `json:"stack_sys_bytes"`
	MSpanInuse      uint64  `json:"mspan_inuse"`
	MCacheInuse     uint64  `json:"mcache_inuse"`
}

// GCStats contains garbage collection statistics
type GCStats struct {
	NumGC           uint32  `json:"num_gc"`
	PauseTotalNs    uint64  `json:"pause_total_ns"`
	PauseTotalMs    float64 `json:"pause_total_ms"`
	LastPauseNs     uint64  `json:"last_pause_ns"`
	LastPauseMs     float64 `json:"last_pause_ms"`
	NextGCBytes     uint64  `json:"next_gc_bytes"`
	GCCPUFraction   float64 `json:"gc_cpu_fraction"`
}

// NewServer creates a new health check server
func NewServer(port int) *Server {
	s := &Server{
		ready:     false,
		startTime: time.Now(),
	}

	mux := http.NewServeMux()
	
	// Health endpoints
	mux.HandleFunc("/healthz", s.livenessHandler)
	mux.HandleFunc("/readyz", s.readinessHandler)
	
	// Runtime stats endpoint for profiling
	mux.HandleFunc("/stats", s.statsHandler)
	mux.HandleFunc("/stats/runtime", s.statsHandler)
	
	// pprof endpoints for detailed profiling
	// Access via: /debug/pprof/
	mux.HandleFunc("/debug/pprof/", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/cmdline", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/profile", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/symbol", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/trace", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/heap", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/goroutine", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/block", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/mutex", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/allocs", http.DefaultServeMux.ServeHTTP)
	mux.HandleFunc("/debug/pprof/threadcreate", http.DefaultServeMux.ServeHTTP)

	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 120 * time.Second, // Longer timeout for pprof profiles
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

// statsHandler returns runtime statistics for profiling
func (s *Server) statsHandler(w http.ResponseWriter, r *http.Request) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	uptime := time.Since(s.startTime)

	stats := RuntimeStats{
		Timestamp:     time.Now(),
		Uptime:        uptime.String(),
		UptimeSeconds: uptime.Seconds(),
		Goroutines:    runtime.NumGoroutine(),
		NumCPU:        runtime.NumCPU(),
		GOMAXPROCS:    runtime.GOMAXPROCS(0),
		CGOCalls:      runtime.NumCgoCall(),
		Memory: MemStats{
			AllocBytes:      memStats.Alloc,
			AllocMB:         float64(memStats.Alloc) / 1024 / 1024,
			TotalAllocBytes: memStats.TotalAlloc,
			TotalAllocMB:    float64(memStats.TotalAlloc) / 1024 / 1024,
			SysBytes:        memStats.Sys,
			SysMB:           float64(memStats.Sys) / 1024 / 1024,
			HeapAllocBytes:  memStats.HeapAlloc,
			HeapAllocMB:     float64(memStats.HeapAlloc) / 1024 / 1024,
			HeapSysBytes:    memStats.HeapSys,
			HeapSysMB:       float64(memStats.HeapSys) / 1024 / 1024,
			HeapObjects:     memStats.HeapObjects,
			StackInuseBytes: memStats.StackInuse,
			StackSysBytes:   memStats.StackSys,
			MSpanInuse:      memStats.MSpanInuse,
			MCacheInuse:     memStats.MCacheInuse,
		},
		GC: GCStats{
			NumGC:         memStats.NumGC,
			PauseTotalNs:  memStats.PauseTotalNs,
			PauseTotalMs:  float64(memStats.PauseTotalNs) / 1e6,
			LastPauseNs:   memStats.PauseNs[(memStats.NumGC+255)%256],
			LastPauseMs:   float64(memStats.PauseNs[(memStats.NumGC+255)%256]) / 1e6,
			NextGCBytes:   memStats.NextGC,
			GCCPUFraction: memStats.GCCPUFraction,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(stats)
}
