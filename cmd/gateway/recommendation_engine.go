package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// RecommendationEngine generates NGINX tuning recommendations
type RecommendationEngine struct {
	db        *ClickHouseDB
	llmClient LLMClient
	rules     []RecommendationRule
	cache     *recommendationCache
	mu        sync.RWMutex
}

// RecommendationRule defines a rule-based recommendation
type RecommendationRule struct {
	ID        string
	Name      string
	Category  string
	Priority  int
	Condition func(*ErrorAnalysisContext) bool
	Generate  func(*ErrorAnalysisContext) *AIRecommendation
}

// recommendationCache caches generated recommendations
type recommendationCache struct {
	recommendations map[string]*AIRecommendation
	lastGenerated   time.Time
	ttl             time.Duration
	mu              sync.RWMutex
}

// NewRecommendationEngine creates a new recommendation engine
func NewRecommendationEngine(db *ClickHouseDB, llmClient LLMClient) *RecommendationEngine {
	re := &RecommendationEngine{
		db:        db,
		llmClient: llmClient,
		rules:     make([]RecommendationRule, 0),
		cache: &recommendationCache{
			recommendations: make(map[string]*AIRecommendation),
			ttl:             30 * time.Minute,
		},
	}

	re.registerBuiltInRules()
	return re
}

func (re *RecommendationEngine) SetLLMClient(llmClient LLMClient) {
	re.mu.Lock()
	defer re.mu.Unlock()
	re.llmClient = llmClient
	// Invalidate cache to avoid serving recommendations generated under old model/provider.
	if re.cache != nil {
		re.cache.mu.Lock()
		re.cache.recommendations = make(map[string]*AIRecommendation)
		re.cache.lastGenerated = time.Time{}
		re.cache.mu.Unlock()
	}
}

// registerBuiltInRules adds all built-in recommendation rules
func (re *RecommendationEngine) registerBuiltInRules() {
	// 499 Client Closed Connection
	re.rules = append(re.rules, RecommendationRule{
		ID:       "499-timeout-tuning",
		Name:     "Client Timeout Optimization",
		Category: "performance",
		Priority: 10,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.Error499Rate > 1.0 // >1% of traffic
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-499-timeout",
				Title:       "Reduce 499 Errors with Timeout Tuning",
				Description: fmt.Sprintf("%.2f%% of requests result in client-closed connections (499)", ctx.Error499Rate),
				Category:    "performance",
				Impact:      "high",
				Problem: "499 errors occur when clients close connections before receiving a response. " +
					"This typically indicates backend latency issues or timeout mismatches between client, NGINX, and upstream.",
				Solution:      "Increase proxy timeouts to match backend response times, enable keepalive connections to upstream.",
				CurrentConfig: ctx.CurrentConfig.GetTimeouts(),
				SuggestedConfig: `# Increase timeouts for slow backends
proxy_connect_timeout 60s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

# Enable keepalive to upstreams (reduces connection overhead)
upstream backend {
    server backend1:8080;
    keepalive 32;
    keepalive_timeout 60s;
}

# Ensure proxy uses HTTP/1.1 for keepalive
location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}`,
				AffectedDirectives:   []string{"proxy_connect_timeout", "proxy_send_timeout", "proxy_read_timeout", "keepalive"},
				EstimatedImprovement: "50-70% reduction in 499 errors",
				Risks:                []string{"Higher memory usage from keepalive connections", "Longer request queuing if backends are truly slow"},
				Status:               "pending",
			}
		},
	})

	// 502 Bad Gateway
	re.rules = append(re.rules, RecommendationRule{
		ID:       "502-upstream-health",
		Name:     "Upstream Health Check Configuration",
		Category: "reliability",
		Priority: 20,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.Error502Count > 100 // per window
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-502-health",
				Title:       "Enable Upstream Health Checks and Failover",
				Description: fmt.Sprintf("%d 502 errors detected - upstream servers may be unstable", ctx.Error502Count),
				Category:    "reliability",
				Impact:      "critical",
				Problem:     "502 Bad Gateway errors indicate NGINX received an invalid response from upstream servers. Common causes: upstream crash, connection refused, socket errors.",
				Solution:    "Configure upstream failover, health checks, and retry policies.",
				SuggestedConfig: `upstream backend {
    zone backend_zone 64k;
    
    # Multiple servers with failure detection
    server backend1:8080 max_fails=3 fail_timeout=30s;
    server backend2:8080 max_fails=3 fail_timeout=30s;
    server backend3:8080 backup;  # Only used when others fail
    
    # Enable keepalive for efficiency
    keepalive 32;
}

# Retry on upstream errors
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 3;
proxy_next_upstream_timeout 30s;

# Log upstream failures for debugging
log_format upstream_log '$remote_addr - $upstream_addr - $upstream_status - $request_time';`,
				AffectedDirectives:   []string{"upstream", "max_fails", "fail_timeout", "proxy_next_upstream"},
				EstimatedImprovement: "Near-zero 502 errors with properly configured failover",
				Risks:                []string{"Increased latency during failover", "May mask underlying upstream issues"},
				Status:               "pending",
			}
		},
	})

	// 503 Service Unavailable
	re.rules = append(re.rules, RecommendationRule{
		ID:       "503-connection-limits",
		Name:     "Connection Capacity Tuning",
		Category: "performance",
		Priority: 15,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.Error503Count > 50 && ctx.ActiveConnections > int64(float64(ctx.WorkerConnections)*0.8)
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-503-connections",
				Title:       "Increase Connection Capacity",
				Description: fmt.Sprintf("503 errors with %.0f%% connection capacity used", float64(ctx.ActiveConnections)/float64(ctx.WorkerConnections)*100),
				Category:    "performance",
				Impact:      "high",
				Problem:     "503 errors indicate the server cannot handle current connection load. Worker connections are near capacity.",
				Solution:    "Increase worker_connections and consider implementing connection queuing.",
				SuggestedConfig: fmt.Sprintf(`# Increase worker connections (current: %d)
worker_connections %d;

# Increase file descriptor limit
worker_rlimit_nofile 65535;

# Add connection queue for burst handling
upstream backend {
    zone backend_zone 64k;
    server backend:8080;
    queue 100 timeout=30s;
}

# Implement graceful rate limiting (instead of hard 503)
limit_conn_zone $binary_remote_addr zone=addr:10m;
limit_conn addr 100;
limit_conn_status 429;  # Return 429 instead of 503`, ctx.WorkerConnections, ctx.WorkerConnections*2),
				AffectedDirectives:   []string{"worker_connections", "worker_rlimit_nofile", "limit_conn"},
				EstimatedImprovement: "Handle 2x current connection load",
				Risks:                []string{"Higher memory usage", "May need OS-level tuning for file descriptors"},
				Status:               "pending",
			}
		},
	})

	// 504 Gateway Timeout
	re.rules = append(re.rules, RecommendationRule{
		ID:       "504-timeout-optimization",
		Name:     "Gateway Timeout Optimization",
		Category: "performance",
		Priority: 15,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.Error504Count > 20
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			suggestedTimeout := ctx.P95UpstreamLatency * 2 / 1000 // Convert ms to seconds, 2x P95
			if suggestedTimeout < 60 {
				suggestedTimeout = 60
			}
			if suggestedTimeout > 300 {
				suggestedTimeout = 300
			}

			return &AIRecommendation{
				ID:          "rec-504-timeout",
				Title:       "Optimize Gateway Timeout Settings",
				Description: fmt.Sprintf("%d gateway timeouts - backends responding slower than timeout", ctx.Error504Count),
				Category:    "performance",
				Impact:      "high",
				Problem:     fmt.Sprintf("504 errors occur when upstream doesn't respond within timeout. Current P95 latency: %.2fms", ctx.P95UpstreamLatency),
				Solution:    "Adjust timeout to match backend response times, enable buffering for slow clients.",
				SuggestedConfig: fmt.Sprintf(`# Adjusted based on P95 latency (%.2fms)
proxy_connect_timeout 10s;
proxy_send_timeout %.0fs;
proxy_read_timeout %.0fs;

# Enable buffering for slow clients (prevents upstream timeout while sending to client)
proxy_buffering on;
proxy_buffer_size 4k;
proxy_buffers 8 32k;
proxy_busy_buffers_size 64k;

# For specific slow endpoints, use longer timeouts
location /slow-api {
    proxy_pass http://backend;
    proxy_read_timeout 300s;
}`, ctx.P95UpstreamLatency, suggestedTimeout, suggestedTimeout),
				AffectedDirectives:   []string{"proxy_connect_timeout", "proxy_send_timeout", "proxy_read_timeout", "proxy_buffering"},
				EstimatedImprovement: "Eliminate timeout-based 504 errors",
				Risks:                []string{"Longer timeouts may delay error detection", "Increased memory usage from buffering"},
				Status:               "pending",
			}
		},
	})

	// High 4xx Error Rate
	re.rules = append(re.rules, RecommendationRule{
		ID:       "4xx-request-validation",
		Name:     "Request Validation and Error Handling",
		Category: "security",
		Priority: 5,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.Error4xxRate > 5.0 // >5% of traffic
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-4xx-validation",
				Title:       "Improve Request Validation and Error Pages",
				Description: fmt.Sprintf("%.2f%% of requests result in 4xx errors", ctx.Error4xxRate),
				Category:    "security",
				Impact:      "medium",
				Problem:     "High 4xx rate may indicate malformed requests, missing resources, or potential attack attempts.",
				Solution:    "Implement request validation, custom error pages, and security hardening.",
				SuggestedConfig: `# Validate request method
if ($request_method !~ ^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)$) {
    return 444;  # Close connection without response
}

# Limit request body size
client_max_body_size 10m;
client_body_buffer_size 128k;

# Header buffer settings
large_client_header_buffers 4 16k;

# Custom error pages (better UX)
error_page 400 401 403 404 /error.html;
location = /error.html {
    internal;
    root /usr/share/nginx/html;
}

# Block common attack patterns
location ~* \.(git|env|htaccess|htpasswd)$ {
    deny all;
    return 404;
}`,
				AffectedDirectives:   []string{"client_max_body_size", "large_client_header_buffers", "error_page"},
				EstimatedImprovement: "Better security posture and user experience",
				Risks:                []string{"May block legitimate edge-case requests"},
				Status:               "pending",
			}
		},
	})

	// Rate Limiting Recommendation
	re.rules = append(re.rules, RecommendationRule{
		ID:       "429-rate-limiting",
		Name:     "Rate Limiting Configuration",
		Category: "security",
		Priority: 10,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			// Recommend rate limiting if we see burst patterns or many 429s
			return ctx.TrafficSpike
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-rate-limit",
				Title:       "Implement Rate Limiting",
				Description: "Traffic spikes detected - rate limiting can protect backend services",
				Category:    "security",
				Impact:      "medium",
				Problem:     "Without rate limiting, traffic spikes can overwhelm backend services.",
				Solution:    "Implement request rate limiting with burst handling.",
				SuggestedConfig: `# Define rate limit zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

# Connection limiting
limit_conn_zone $binary_remote_addr zone=addr:10m;

# Apply to API endpoints
location /api/ {
    limit_req zone=api burst=20 nodelay;
    limit_conn addr 100;
    proxy_pass http://backend;
}

# Stricter limits for auth endpoints
location /api/auth/ {
    limit_req zone=login burst=5 nodelay;
    limit_conn addr 10;
    proxy_pass http://backend;
}

# Return 429 (not 503) for rate limits
limit_req_status 429;
limit_conn_status 429;`,
				AffectedDirectives:   []string{"limit_req_zone", "limit_req", "limit_conn_zone", "limit_conn"},
				EstimatedImprovement: "Protection against traffic spikes and DDoS",
				Risks:                []string{"May block legitimate burst traffic", "Needs tuning for specific traffic patterns"},
				Status:               "pending",
			}
		},
	})

	// Log Rotation
	re.rules = append(re.rules, RecommendationRule{
		ID:       "log-rotation",
		Name:     "Log Rotation and Buffering",
		Category: "operations",
		Priority: 1,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return true // Always recommend good logging practices
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-logging",
				Title:       "Configure Optimized Logging",
				Description: "Optimize log handling for performance and retention",
				Category:    "operations",
				Impact:      "low",
				Problem:     "Unbuffered logging can impact performance; missing rotation causes disk issues.",
				Solution:    "Enable log buffering and configure rotation.",
				SuggestedConfig: `# Buffered logging (reduces I/O overhead)
access_log /var/log/nginx/access.log combined buffer=64k flush=5s;
error_log /var/log/nginx/error.log warn;

# Conditional logging (skip health checks)
map $request_uri $loggable {
    default 1;
    ~*^/health 0;
    ~*^/ready 0;
    ~*^/metrics 0;
}
access_log /var/log/nginx/access.log combined buffer=64k flush=5s if=$loggable;

# /etc/logrotate.d/nginx
# /var/log/nginx/*.log {
#     daily
#     rotate 14
#     compress
#     delaycompress
#     missingok
#     notifempty
#     create 0640 www-data adm
#     sharedscripts
#     postrotate
#         [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
#     endscript
# }`,
				AffectedDirectives:   []string{"access_log", "error_log"},
				EstimatedImprovement: "Reduced I/O overhead, proper log retention",
				Risks:                []string{"Log buffer may lose entries on crash"},
				Status:               "pending",
			}
		},
	})

	// Worker Process Optimization
	re.rules = append(re.rules, RecommendationRule{
		ID:       "worker-optimization",
		Name:     "Worker Process Optimization",
		Category: "performance",
		Priority: 5,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return ctx.CPUUsage > 70 || ctx.ActiveConnections > int64(ctx.WorkerConnections/2)
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-worker-opt",
				Title:       "Optimize Worker Processes",
				Description: fmt.Sprintf("High resource usage: CPU %.1f%%, Connections at %.0f%% capacity", ctx.CPUUsage, float64(ctx.ActiveConnections)/float64(ctx.WorkerConnections)*100),
				Category:    "performance",
				Impact:      "medium",
				Problem:     "Worker processes may not be optimally configured for current load.",
				Solution:    "Tune worker processes and connections for the workload.",
				SuggestedConfig: `# Auto-detect CPU cores
worker_processes auto;

# Increase file descriptors
worker_rlimit_nofile 65535;

events {
    # Connections per worker
    worker_connections 4096;
    
    # Efficient event handling (Linux)
    use epoll;
    
    # Accept multiple connections at once
    multi_accept on;
}

# Enable sendfile for static content
sendfile on;
tcp_nopush on;
tcp_nodelay on;

# Gzip compression (reduce bandwidth, increase CPU slightly)
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml;`,
				AffectedDirectives:   []string{"worker_processes", "worker_connections", "worker_rlimit_nofile"},
				EstimatedImprovement: "Better CPU utilization and connection handling",
				Risks:                []string{"May require OS-level tuning"},
				Status:               "pending",
			}
		},
	})

	// Security Headers
	re.rules = append(re.rules, RecommendationRule{
		ID:       "security-headers",
		Name:     "Security Headers Configuration",
		Category: "security",
		Priority: 3,
		Condition: func(ctx *ErrorAnalysisContext) bool {
			return true // Always recommend security headers
		},
		Generate: func(ctx *ErrorAnalysisContext) *AIRecommendation {
			return &AIRecommendation{
				ID:          "rec-security-headers",
				Title:       "Add Security Headers",
				Description: "Enhance security with HTTP security headers",
				Category:    "security",
				Impact:      "medium",
				Problem:     "Missing security headers expose the application to common web vulnerabilities.",
				Solution:    "Add recommended security headers.",
				SuggestedConfig: `# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# HSTS (only enable if SSL is properly configured)
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Hide NGINX version
server_tokens off;

# Prevent directory listing
autoindex off;`,
				AffectedDirectives:   []string{"add_header", "server_tokens"},
				EstimatedImprovement: "Protection against XSS, clickjacking, and information disclosure",
				Risks:                []string{"HSTS can lock out users if SSL is misconfigured"},
				Status:               "pending",
			}
		},
	})
}

// GenerateRecommendations generates recommendations based on current metrics
func (re *RecommendationEngine) GenerateRecommendations(ctx context.Context, analysisCtx *ErrorAnalysisContext) ([]*AIRecommendation, error) {
	re.mu.Lock()
	defer re.mu.Unlock()

	var recommendations []*AIRecommendation

	// Apply rule-based recommendations
	for _, rule := range re.rules {
		if rule.Condition(analysisCtx) {
			rec := rule.Generate(analysisCtx)
			if rec != nil {
				rec.Confidence = 0.85 // Rule-based confidence
				recommendations = append(recommendations, rec)
			}
		}
	}

	// Try to enhance with LLM if available
	if re.llmClient != nil && re.llmClient.GetProviderName() != "mock" {
		llmRecs, err := re.generateLLMRecommendations(ctx, analysisCtx)
		if err != nil {
			log.Printf("LLM recommendation generation failed (using rules only): %v", err)
		} else {
			// Merge LLM recommendations, avoiding duplicates
			recommendations = mergeRecommendations(recommendations, llmRecs)
		}
	}

	// Sort by impact/priority
	sortRecommendations(recommendations)

	return recommendations, nil
}

// generateLLMRecommendations uses the LLM to generate additional recommendations
func (re *RecommendationEngine) generateLLMRecommendations(ctx context.Context, analysisCtx *ErrorAnalysisContext) ([]*AIRecommendation, error) {
	req := &RecommendationRequest{
		ErrorPatterns: analysisCtx.ErrorPatterns,
		TrafficPatterns: &TrafficPatterns{
			PeakRPS:    float64(analysisCtx.TotalRequests) / analysisCtx.TimeWindow.Seconds(),
			UniqueIPs:  0, // Would need to calculate
			BotPercent: 0,
		},
		CurrentConfig: analysisCtx.CurrentConfig.GetTimeouts(),
		MaxTokens:     2000,
		Temperature:   0.3,
	}

	resp, err := re.llmClient.GenerateRecommendation(ctx, req)
	if err != nil {
		return nil, err
	}

	var recs []*AIRecommendation
	for i := range resp.Recommendations {
		rec := resp.Recommendations[i]
		rec.Confidence = resp.Confidence
		recs = append(recs, &rec)
	}

	return recs, nil
}

// AnalyzeErrors performs comprehensive error analysis
func (re *RecommendationEngine) AnalyzeErrors(ctx context.Context, analysisCtx *ErrorAnalysisContext) (*AnalysisResponse, error) {
	if re.llmClient == nil {
		return generateRuleBasedAnalysis(&AnalysisRequest{
			ErrorPatterns: analysisCtx.ErrorPatterns,
		}), nil
	}

	req := &AnalysisRequest{
		ErrorPatterns: analysisCtx.ErrorPatterns,
		SystemMetrics: &SystemMetricsSnapshot{
			CPUUsage:          analysisCtx.CPUUsage,
			MemoryUsage:       analysisCtx.MemoryUsage,
			ActiveConnections: analysisCtx.ActiveConnections,
			UpstreamP95:       analysisCtx.P95UpstreamLatency,
		},
		TimeWindow: analysisCtx.TimeWindow.String(),
	}

	return re.llmClient.Analyze(ctx, req)
}

// Helper functions

func mergeRecommendations(base, additional []*AIRecommendation) []*AIRecommendation {
	seen := make(map[string]bool)
	result := make([]*AIRecommendation, 0, len(base)+len(additional))

	for _, r := range base {
		seen[r.Title] = true
		result = append(result, r)
	}

	for _, r := range additional {
		if !seen[r.Title] {
			result = append(result, r)
		}
	}

	return result
}

func sortRecommendations(recs []*AIRecommendation) {
	// Sort by impact (critical > high > medium > low)
	impactOrder := map[string]int{
		"critical": 4,
		"high":     3,
		"medium":   2,
		"low":      1,
	}

	for i := 0; i < len(recs)-1; i++ {
		for j := i + 1; j < len(recs); j++ {
			if impactOrder[recs[j].Impact] > impactOrder[recs[i].Impact] {
				recs[i], recs[j] = recs[j], recs[i]
			}
		}
	}
}
