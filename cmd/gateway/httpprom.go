package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/avika-ai/avika/internal/common/logging"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
)

var (
	avikaHTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "avika_http_requests_total",
			Help: "Total HTTP requests to the Avika gateway",
		},
		[]string{"method", "path", "status"},
	)
	avikaHTTPRequestDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "avika_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)
)

func init() {
	prometheus.MustRegister(avikaHTTPRequestsTotal, avikaHTTPRequestDurationSeconds)
}

// responseRecorder wraps http.ResponseWriter to capture status and bytes written.
type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.bytes += int64(n)
	return n, err
}

// metricsAndLogMiddleware records Prometheus HTTP metrics and optionally logs each request.
func metricsAndLogMiddleware(logger zerolog.Logger, logRequests bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			duration := time.Since(start)
			method := r.Method
			path := r.URL.Path
			if path == "" {
				path = "/"
			}
			status := rec.status
			statusStr := strconv.Itoa(status)

			avikaHTTPRequestsTotal.WithLabelValues(method, path, statusStr).Inc()
			avikaHTTPRequestDurationSeconds.WithLabelValues(method, path).Observe(duration.Seconds())

			if logRequests && logger.GetLevel() <= zerolog.InfoLevel {
				remoteAddr := r.RemoteAddr
				if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
					remoteAddr = xff
				}
				logging.LogHTTPRequest(logger, method, path, remoteAddr, status, duration, rec.bytes)
			}
		})
	}
}
