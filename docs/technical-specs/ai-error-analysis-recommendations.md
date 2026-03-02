# AI-Powered Error Analysis & Recommendations System

## Executive Summary

This document outlines an enterprise-grade AI system for analyzing HTTP errors (4xx, 5xx, 499), detecting patterns, and providing intelligent recommendations for NGINX tuning, request optimization, and operational improvements.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Error Classification System](#2-error-classification-system)
3. [Data Pipeline & Storage](#3-data-pipeline--storage)
4. [AI/LLM Integration](#4-aillm-integration)
5. [Pattern Detection Engine](#5-pattern-detection-engine)
6. [Recommendation Engine](#6-recommendation-engine)
7. [API Design](#7-api-design)
8. [Frontend Components](#8-frontend-components)
9. [Enterprise Scalability](#9-enterprise-scalability)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AI Error Analysis System                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   NGINX      │    │   Gateway       │    │     AI Analysis Engine          │ │
│  │   Agents     │───▶│   (Ingest)      │───▶│  ┌───────────────────────────┐  │ │
│  │              │    │                 │    │  │  Error Classifier         │  │ │
│  └──────────────┘    └─────────────────┘    │  ├───────────────────────────┤  │ │
│                             │                │  │  Pattern Detector         │  │ │
│                             ▼                │  ├───────────────────────────┤  │ │
│  ┌──────────────────────────────────────┐   │  │  Root Cause Analyzer      │  │ │
│  │          ClickHouse                   │   │  ├───────────────────────────┤  │ │
│  │  ┌────────────────────────────────┐  │   │  │  LLM Recommendation Gen   │  │ │
│  │  │ access_logs                    │  │   │  └───────────────────────────┘  │ │
│  │  │ error_patterns (NEW)           │  │   └─────────────────────────────────┘ │
│  │  │ error_analysis (NEW)           │  │                   │                    │
│  │  │ anomaly_events (NEW)           │  │                   ▼                    │
│  │  │ ai_recommendations (NEW)       │  │   ┌─────────────────────────────────┐ │
│  │  └────────────────────────────────┘  │   │     LLM Providers               │ │
│  └──────────────────────────────────────┘   │  ┌─────┐ ┌─────┐ ┌─────────┐    │ │
│                                              │  │OpenAI│ │Claude│ │Ollama   │    │ │
│  ┌──────────────────────────────────────┐   │  │     │ │     │ │(Local)  │    │ │
│  │          Kafka (Optional)             │   │  └─────┘ └─────┘ └─────────┘    │ │
│  │  ┌────────────────────────────────┐  │   └─────────────────────────────────┘ │
│  │  │ error-events                   │  │                                        │
│  │  │ recommendations                │  │                                        │
│  │  │ anomaly-alerts                 │  │                                        │
│  │  └────────────────────────────────┘  │                                        │
│  └──────────────────────────────────────┘                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Error Classifier** | Categorize errors by type, severity, root cause | Go + Rule Engine |
| **Pattern Detector** | Identify recurring error patterns, clustering | Statistical + ML |
| **Root Cause Analyzer** | Correlate errors with system metrics | Time-series Analysis |
| **LLM Recommendation Generator** | Generate human-readable recommendations | OpenAI/Claude/Ollama |
| **Anomaly Detector** | Real-time spike/anomaly detection | Statistical Models |

---

## 2. Error Classification System

### 2.1 Error Categories

```go
type ErrorCategory struct {
    Code           int      // HTTP status code
    Category       string   // Category name
    Severity       string   // critical, warning, info
    RootCauses     []string // Possible root causes
    Tuning         []string // Related tuning parameters
}

var ErrorClassifications = map[int]ErrorCategory{
    // 4xx Client Errors
    400: {
        Category:   "bad_request",
        Severity:   "warning",
        RootCauses: []string{"malformed_request", "invalid_headers", "body_too_large"},
        Tuning:     []string{"client_body_buffer_size", "large_client_header_buffers"},
    },
    401: {
        Category:   "authentication",
        Severity:   "warning", 
        RootCauses: []string{"missing_credentials", "expired_token", "invalid_token"},
        Tuning:     []string{"auth_basic", "auth_jwt"},
    },
    403: {
        Category:   "authorization",
        Severity:   "warning",
        RootCauses: []string{"ip_blocked", "rate_limited", "waf_blocked", "permission_denied"},
        Tuning:     []string{"allow/deny", "limit_req", "limit_conn"},
    },
    404: {
        Category:   "not_found",
        Severity:   "info",
        RootCauses: []string{"missing_resource", "wrong_path", "broken_link", "removed_content"},
        Tuning:     []string{"try_files", "error_page", "rewrite"},
    },
    408: {
        Category:   "timeout",
        Severity:   "warning",
        RootCauses: []string{"client_slow", "network_issues", "large_upload"},
        Tuning:     []string{"client_body_timeout", "client_header_timeout", "send_timeout"},
    },
    413: {
        Category:   "payload_too_large",
        Severity:   "warning",
        RootCauses: []string{"file_upload_limit", "body_size_exceeded"},
        Tuning:     []string{"client_max_body_size", "client_body_buffer_size"},
    },
    429: {
        Category:   "rate_limited",
        Severity:   "warning",
        RootCauses: []string{"too_many_requests", "api_quota_exceeded"},
        Tuning:     []string{"limit_req_zone", "limit_req", "limit_conn"},
    },
    499: {
        Category:   "client_closed",
        Severity:   "warning",
        RootCauses: []string{"slow_backend", "impatient_client", "timeout_mismatch", "network_drop"},
        Tuning:     []string{"proxy_read_timeout", "proxy_connect_timeout", "keepalive_timeout"},
    },
    
    // 5xx Server Errors
    500: {
        Category:   "internal_error",
        Severity:   "critical",
        RootCauses: []string{"application_crash", "script_error", "config_error"},
        Tuning:     []string{"error_log level", "fastcgi_params", "proxy_pass"},
    },
    502: {
        Category:   "bad_gateway",
        Severity:   "critical",
        RootCauses: []string{"upstream_down", "upstream_crashed", "socket_error", "dns_failure"},
        Tuning:     []string{"upstream health_check", "proxy_next_upstream", "resolver"},
    },
    503: {
        Category:   "service_unavailable",
        Severity:   "critical",
        RootCauses: []string{"overloaded", "maintenance", "circuit_breaker", "rate_limit"},
        Tuning:     []string{"worker_connections", "upstream queue", "limit_conn_zone"},
    },
    504: {
        Category:   "gateway_timeout",
        Severity:   "critical",
        RootCauses: []string{"upstream_slow", "database_slow", "external_api_slow", "deadlock"},
        Tuning:     []string{"proxy_read_timeout", "proxy_connect_timeout", "proxy_send_timeout"},
    },
}
```

### 2.2 Error Fingerprinting

Generate unique signatures for error grouping:

```go
type ErrorFingerprint struct {
    StatusCode    int
    URIPattern    string   // Normalized URI pattern (e.g., /api/users/*)
    Method        string
    UpstreamAddr  string
    ErrorContext  string   // upstream_status, error message hints
    Hash          string   // SHA256 of combined fields
}

func GenerateFingerprint(entry *LogEntry) *ErrorFingerprint {
    // Normalize URI (replace IDs with placeholders)
    uriPattern := normalizeURI(entry.RequestUri)
    // e.g., /api/users/12345/orders -> /api/users/*/orders
    
    combined := fmt.Sprintf("%d|%s|%s|%s", 
        entry.Status, uriPattern, entry.RequestMethod, entry.UpstreamStatus)
    hash := sha256.Sum256([]byte(combined))
    
    return &ErrorFingerprint{
        StatusCode:   int(entry.Status),
        URIPattern:   uriPattern,
        Method:       entry.RequestMethod,
        UpstreamAddr: entry.UpstreamAddr,
        ErrorContext: entry.UpstreamStatus,
        Hash:         hex.EncodeToString(hash[:8]),
    }
}
```

---

## 3. Data Pipeline & Storage

### 3.1 New ClickHouse Tables

```sql
-- Error patterns for clustering and deduplication
CREATE TABLE IF NOT EXISTS nginx_analytics.error_patterns (
    fingerprint String,
    status_code UInt16,
    uri_pattern String,
    method String,
    upstream_addr String,
    error_context String,
    first_seen DateTime64(3),
    last_seen DateTime64(3),
    occurrence_count UInt64,
    affected_agents Array(String),
    sample_request_ids Array(String),
    
    -- Classification
    category String,
    severity String,
    root_causes Array(String),
    
    -- Metrics
    avg_latency Float32,
    max_latency Float32,
    p95_latency Float32,
    
    INDEX idx_severity severity TYPE bloom_filter GRANULARITY 1,
    INDEX idx_status status_code TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(last_seen)
ORDER BY (fingerprint)
TTL last_seen + INTERVAL 30 DAY;

-- AI-generated analysis and recommendations
CREATE TABLE IF NOT EXISTS nginx_analytics.error_analysis (
    analysis_id UUID,
    fingerprint String,
    timestamp DateTime64(3),
    
    -- Analysis results
    root_cause_analysis String,        -- LLM-generated explanation
    impact_assessment String,          -- Severity and affected users
    recommended_actions Array(String), -- Action items
    nginx_config_suggestions String,   -- Config changes
    
    -- Confidence and metadata
    confidence Float32,
    model_used String,                 -- openai-gpt4, claude-3, ollama-llama2
    tokens_used UInt32,
    processing_time_ms UInt32,
    
    -- Status
    status String,                     -- pending, completed, failed
    user_feedback String,              -- helpful, not_helpful, applied
    
    INDEX idx_fingerprint fingerprint TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, fingerprint)
TTL timestamp + INTERVAL 90 DAY;

-- Real-time anomaly events
CREATE TABLE IF NOT EXISTS nginx_analytics.anomaly_events (
    event_id UUID,
    timestamp DateTime64(3),
    
    -- Anomaly details
    anomaly_type String,    -- spike, drop, pattern_change, threshold_breach
    metric_name String,     -- error_rate, 5xx_count, latency_p99, 499_count
    current_value Float64,
    baseline_value Float64,
    deviation_percent Float64,
    
    -- Context
    affected_agents Array(String),
    affected_endpoints Array(String),
    time_window_minutes UInt16,
    
    -- Classification
    severity String,        -- critical, warning, info
    auto_resolved UInt8,
    resolution_time DateTime64(3),
    
    INDEX idx_severity severity TYPE bloom_filter GRANULARITY 1,
    INDEX idx_type anomaly_type TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, anomaly_type)
TTL timestamp + INTERVAL 30 DAY;

-- Persisted AI recommendations
CREATE TABLE IF NOT EXISTS nginx_analytics.ai_recommendations (
    recommendation_id UUID,
    created_at DateTime64(3),
    
    -- Recommendation details
    title String,
    description String,
    category String,          -- performance, security, reliability, cost
    impact String,            -- high, medium, low
    
    -- Technical details
    current_config String,
    suggested_config String,
    affected_directives Array(String),
    estimated_improvement String,
    
    -- Context
    based_on_errors Array(String),    -- error fingerprints
    based_on_metrics String,          -- JSON of relevant metrics
    applicable_agents Array(String),
    
    -- Status
    status String,            -- pending, applied, dismissed, scheduled
    applied_at DateTime64(3),
    applied_by String,
    
    -- AI metadata
    model_used String,
    confidence Float32,
    
    INDEX idx_category category TYPE bloom_filter GRANULARITY 1,
    INDEX idx_status status TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (created_at, category)
TTL created_at + INTERVAL 180 DAY;

-- Materialized view for error rate trends (for anomaly detection baseline)
CREATE TABLE IF NOT EXISTS nginx_analytics.error_rate_hourly (
    hour DateTime,
    instance_id String,
    total_requests UInt64,
    error_4xx UInt64,
    error_5xx UInt64,
    error_499 UInt64,
    error_rate_4xx Float32,
    error_rate_5xx Float32,
    avg_latency Float32,
    p95_latency Float32
) ENGINE = SummingMergeTree()
ORDER BY (hour, instance_id)
TTL hour + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS nginx_analytics.error_rate_hourly_mv
TO nginx_analytics.error_rate_hourly
AS SELECT
    toStartOfHour(timestamp) as hour,
    instance_id,
    count() as total_requests,
    countIf(status >= 400 AND status < 500) as error_4xx,
    countIf(status >= 500) as error_5xx,
    countIf(status = 499) as error_499,
    if(count() > 0, countIf(status >= 400 AND status < 500) / count() * 100, 0) as error_rate_4xx,
    if(count() > 0, countIf(status >= 500) / count() * 100, 0) as error_rate_5xx,
    avg(request_time) * 1000 as avg_latency,
    quantile(0.95)(request_time) * 1000 as p95_latency
FROM nginx_analytics.access_logs
GROUP BY hour, instance_id;
```

### 3.2 Error Processing Pipeline

```go
// ErrorProcessor handles error classification and pattern detection
type ErrorProcessor struct {
    db           *ClickHouseDB
    classifier   *ErrorClassifier
    patternStore *PatternStore
    anomalyDet   *AnomalyDetector
    llmClient    LLMClient
    kafkaProducer *kafka.Producer // Optional
}

// ProcessError is called for each log entry with status >= 400
func (ep *ErrorProcessor) ProcessError(entry *pb.LogEntry, agentID string) error {
    // 1. Classify the error
    classification := ep.classifier.Classify(entry)
    
    // 2. Generate fingerprint
    fingerprint := GenerateFingerprint(entry)
    
    // 3. Update pattern store (in-memory + periodic flush)
    pattern := ep.patternStore.UpdatePattern(fingerprint, entry, agentID, classification)
    
    // 4. Check for anomalies
    if anomaly := ep.anomalyDet.Check(entry, agentID); anomaly != nil {
        ep.handleAnomaly(anomaly)
    }
    
    // 5. Optionally publish to Kafka for async processing
    if ep.kafkaProducer != nil {
        ep.kafkaProducer.Publish("error-events", &ErrorEvent{
            Fingerprint:    fingerprint.Hash,
            Entry:          entry,
            AgentID:        agentID,
            Classification: classification,
        })
    }
    
    return nil
}
```

---

## 4. AI/LLM Integration

### 4.1 LLM Provider Interface

```go
// LLMClient abstracts different LLM providers
type LLMClient interface {
    Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error)
    GenerateRecommendation(ctx context.Context, req *RecommendationRequest) (*RecommendationResponse, error)
    GetProviderName() string
    GetModelName() string
}

type AnalysisRequest struct {
    ErrorPattern    *ErrorPattern
    SystemMetrics   *SystemMetricsSnapshot
    RecentLogs      []*pb.LogEntry
    NginxConfig     string // Current relevant config
    HistoricalData  *HistoricalContext
}

type AnalysisResponse struct {
    RootCauseAnalysis    string
    ImpactAssessment     string
    RecommendedActions   []string
    ConfigSuggestions    string
    Confidence           float32
    TokensUsed           int
    ProcessingTimeMs     int64
}

// Supported LLM providers
type OpenAIClient struct {
    apiKey    string
    model     string // gpt-4, gpt-4-turbo, gpt-3.5-turbo
    baseURL   string
}

type ClaudeClient struct {
    apiKey    string
    model     string // claude-3-opus, claude-3-sonnet, claude-3-haiku
}

type OllamaClient struct {
    baseURL   string
    model     string // llama2, mistral, codellama
}
```

### 4.2 LLM Configuration

```go
type LLMConfig struct {
    Provider        string            `json:"provider"`  // openai, anthropic, ollama, azure
    APIKey          string            `json:"api_key"`
    Model           string            `json:"model"`
    BaseURL         string            `json:"base_url"`  // For Ollama or Azure
    MaxTokens       int               `json:"max_tokens"`
    Temperature     float32           `json:"temperature"`
    TimeoutSeconds  int               `json:"timeout_seconds"`
    RetryAttempts   int               `json:"retry_attempts"`
    RateLimitRPM    int               `json:"rate_limit_rpm"` // Requests per minute
    FallbackProvider string           `json:"fallback_provider"`
    EnableCaching   bool              `json:"enable_caching"`
    CacheTTLMinutes int               `json:"cache_ttl_minutes"`
}

// Environment variables
// LLM_PROVIDER=openai
// LLM_API_KEY=sk-xxx
// LLM_MODEL=gpt-4-turbo
// LLM_BASE_URL=https://api.openai.com/v1 (or http://localhost:11434 for Ollama)
// LLM_FALLBACK_PROVIDER=ollama
```

### 4.3 Prompt Engineering

```go
const ErrorAnalysisPrompt = `You are an expert NGINX performance engineer analyzing HTTP errors.

## Error Context
- Status Code: {{.StatusCode}}
- Error Category: {{.Category}}
- Affected Endpoints: {{.AffectedEndpoints}}
- Error Rate: {{.ErrorRate}}% (baseline: {{.BaselineErrorRate}}%)
- Time Range: {{.TimeRange}}

## Sample Error Logs
{{range .SampleLogs}}
- {{.Timestamp}}: {{.Method}} {{.URI}} -> {{.Status}} ({{.Latency}}ms) upstream: {{.UpstreamStatus}}
{{end}}

## System Metrics
- CPU Usage: {{.CPUUsage}}%
- Memory Usage: {{.MemoryUsage}}%
- Active Connections: {{.ActiveConnections}}
- Upstream Response Time: {{.UpstreamP95}}ms (P95)

## Current NGINX Configuration (relevant sections)
{{.NginxConfig}}

## Your Analysis Tasks
1. **Root Cause Analysis**: Identify the most likely cause(s) of these errors
2. **Impact Assessment**: Estimate user impact and business implications
3. **Recommended Actions**: List specific steps to resolve the issue
4. **NGINX Configuration Changes**: Suggest specific directives to tune

Provide your analysis in the following JSON format:
{
    "root_cause": "explanation",
    "impact": "high|medium|low",
    "impact_details": "description of affected users/services",
    "actions": ["action1", "action2"],
    "config_changes": [
        {"directive": "directive_name", "current": "value", "suggested": "value", "reason": "why"}
    ],
    "confidence": 0.0-1.0,
    "additional_investigation": ["what to check next"]
}`

const RecommendationPrompt = `You are an NGINX optimization expert. Based on the following error patterns and system behavior, provide tuning recommendations.

## Error Patterns (Last 24h)
{{range .ErrorPatterns}}
- {{.Category}}: {{.Count}} occurrences ({{.ErrorRate}}% of traffic)
  Top URIs: {{.TopURIs}}
  Avg Latency: {{.AvgLatency}}ms
{{end}}

## Traffic Patterns
- Peak RPS: {{.PeakRPS}}
- Avg RPS: {{.AvgRPS}}
- Unique IPs: {{.UniqueIPs}}
- Bot Traffic: {{.BotPercent}}%

## Current Configuration
{{.CurrentConfig}}

## Task
Generate specific, actionable NGINX tuning recommendations. For each recommendation:
1. Explain the problem it solves
2. Provide the exact configuration change
3. Estimate the expected improvement
4. Note any potential side effects

Format as JSON:
{
    "recommendations": [
        {
            "title": "short title",
            "category": "performance|security|reliability|cost",
            "impact": "high|medium|low",
            "problem": "what's happening",
            "solution": "what to do",
            "config": "exact nginx config snippet",
            "improvement": "expected result",
            "risks": "potential side effects"
        }
    ]
}`
```

### 4.4 Caching Layer

```go
type LLMCache struct {
    redis     *redis.Client
    localLRU  *lru.Cache
    ttl       time.Duration
}

func (c *LLMCache) GetOrGenerate(ctx context.Context, key string, generator func() (*AnalysisResponse, error)) (*AnalysisResponse, error) {
    // Check local LRU first
    if cached, ok := c.localLRU.Get(key); ok {
        return cached.(*AnalysisResponse), nil
    }
    
    // Check Redis
    if c.redis != nil {
        if data, err := c.redis.Get(ctx, key).Bytes(); err == nil {
            var resp AnalysisResponse
            json.Unmarshal(data, &resp)
            c.localLRU.Add(key, &resp)
            return &resp, nil
        }
    }
    
    // Generate new analysis
    resp, err := generator()
    if err != nil {
        return nil, err
    }
    
    // Cache the result
    c.localLRU.Add(key, resp)
    if c.redis != nil {
        data, _ := json.Marshal(resp)
        c.redis.Set(ctx, key, data, c.ttl)
    }
    
    return resp, nil
}
```

---

## 5. Pattern Detection Engine

### 5.1 Error Clustering

```go
type ErrorCluster struct {
    ID              string
    Fingerprints    []string
    Centroid        *ErrorVector
    ErrorCount      int64
    FirstSeen       time.Time
    LastSeen        time.Time
    AffectedAgents  []string
    CommonPatterns  []string
    Severity        string
}

type ErrorVector struct {
    StatusCode       float64
    LatencyNorm      float64  // Normalized latency
    UpstreamError    float64  // 1.0 if upstream error, 0.0 otherwise
    TimeOfDay        float64  // 0-1 normalized
    RequestSizeNorm  float64
    URIDepth         float64  // Path segment count
}

// ClusterErrors groups similar errors using DBSCAN-like algorithm
func (pd *PatternDetector) ClusterErrors(errors []*ErrorPattern) []*ErrorCluster {
    vectors := make([]*ErrorVector, len(errors))
    for i, e := range errors {
        vectors[i] = e.ToVector()
    }
    
    // Use simple density-based clustering
    clusters := pd.dbscan(vectors, epsilon, minPoints)
    
    return clusters
}
```

### 5.2 Time-Series Anomaly Detection

```go
type AnomalyDetector struct {
    baselineWindow time.Duration // e.g., 7 days
    sensitivity    float64       // Standard deviations for alert
    metrics        map[string]*MetricBaseline
}

type MetricBaseline struct {
    HourlyMean   [24]float64 // Mean by hour of day
    HourlyStdDev [24]float64
    DailyMean    [7]float64  // Mean by day of week
    OverallMean  float64
    OverallStdDev float64
}

func (ad *AnomalyDetector) Check(metric string, value float64, timestamp time.Time) *Anomaly {
    baseline, ok := ad.metrics[metric]
    if !ok {
        return nil
    }
    
    hour := timestamp.Hour()
    expectedMean := baseline.HourlyMean[hour]
    expectedStdDev := baseline.HourlyStdDev[hour]
    
    if expectedStdDev == 0 {
        expectedStdDev = baseline.OverallStdDev
    }
    
    deviation := math.Abs(value - expectedMean) / expectedStdDev
    
    if deviation > ad.sensitivity {
        return &Anomaly{
            Metric:          metric,
            CurrentValue:    value,
            ExpectedValue:   expectedMean,
            DeviationSigma:  deviation,
            Timestamp:       timestamp,
            Severity:        ad.classifySeverity(deviation),
        }
    }
    
    return nil
}
```

### 5.3 Request Pattern Analysis

```go
type RequestPatternAnalyzer struct {
    db *ClickHouseDB
}

// AnalyzePatterns identifies problematic request patterns
func (rpa *RequestPatternAnalyzer) AnalyzePatterns(ctx context.Context, window time.Duration) (*PatternAnalysis, error) {
    analysis := &PatternAnalysis{}
    
    // 1. Identify endpoints with high error rates
    analysis.HighErrorEndpoints = rpa.getHighErrorEndpoints(ctx, window)
    
    // 2. Detect burst patterns (many requests in short time)
    analysis.BurstPatterns = rpa.detectBurstPatterns(ctx, window)
    
    // 3. Find slow upstream patterns
    analysis.SlowUpstreams = rpa.findSlowUpstreams(ctx, window)
    
    // 4. Identify suspicious request patterns (possible attacks)
    analysis.SuspiciousPatterns = rpa.detectSuspiciousPatterns(ctx, window)
    
    // 5. Analyze 499 patterns (client timeout correlation)
    analysis.ClientTimeoutPatterns = rpa.analyze499Patterns(ctx, window)
    
    return analysis, nil
}

// analyze499Patterns specifically looks at 499 errors
func (rpa *RequestPatternAnalyzer) analyze499Patterns(ctx context.Context, window time.Duration) []*ClientTimeoutPattern {
    query := `
        SELECT 
            request_uri,
            upstream_addr,
            count(*) as total_499,
            avg(request_time) as avg_latency,
            quantile(0.95)(request_time) as p95_latency,
            countIf(upstream_status = '') as no_upstream_response
        FROM nginx_analytics.access_logs
        WHERE status = 499 
        AND timestamp >= now() - INTERVAL ? SECOND
        GROUP BY request_uri, upstream_addr
        HAVING total_499 > 10
        ORDER BY total_499 DESC
        LIMIT 50
    `
    // Execute and return patterns
    // ...
}
```

---

## 6. Recommendation Engine

### 6.1 Rule-Based Recommendations

```go
type RecommendationRule struct {
    ID          string
    Name        string
    Category    string
    Condition   func(*AnalysisContext) bool
    Generate    func(*AnalysisContext) *Recommendation
    Priority    int
}

var BuiltInRules = []RecommendationRule{
    // 499 Errors (Client Closed Connection)
    {
        ID:       "499-timeout-tuning",
        Name:     "Client Timeout Optimization",
        Category: "performance",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.Error499Rate > 1.0 // >1% of traffic
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Reduce 499 Errors with Timeout Tuning",
                Description: fmt.Sprintf("%.2f%% of requests result in client-closed connections (499)", ctx.Error499Rate),
                Impact:      "high",
                CurrentConfig: ctx.CurrentConfig.GetTimeouts(),
                SuggestedConfig: `# Increase timeouts for slow backends
proxy_connect_timeout 60s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

# Enable keepalive to upstreams
upstream backend {
    server backend1:8080;
    keepalive 32;
    keepalive_timeout 60s;
}`,
                Reason: "499 errors occur when clients close connections before receiving a response. " +
                        "This typically indicates backend latency issues or timeout mismatches.",
            }
        },
    },
    
    // 502 Bad Gateway
    {
        ID:       "502-upstream-health",
        Name:     "Upstream Health Check",
        Category: "reliability",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.Error502Count > 100 // per hour
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Enable Upstream Health Checks",
                Description: fmt.Sprintf("%d 502 errors detected - upstream servers may be unstable", ctx.Error502Count),
                Impact:      "critical",
                SuggestedConfig: `upstream backend {
    zone backend_zone 64k;
    
    server backend1:8080 max_fails=3 fail_timeout=30s;
    server backend2:8080 max_fails=3 fail_timeout=30s;
    server backend3:8080 backup;
    
    # Active health checks (NGINX Plus)
    # health_check interval=10s fails=3 passes=2;
}

# Retry on upstream errors
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 3;
proxy_next_upstream_timeout 30s;`,
            }
        },
    },
    
    // 503 Service Unavailable
    {
        ID:       "503-connection-limits",
        Name:     "Connection Limit Tuning",
        Category: "performance",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.Error503Rate > 0.5 && ctx.ActiveConnections > ctx.WorkerConnections*0.8
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Increase Connection Capacity",
                Description: "503 errors indicate connection limits are being reached",
                Impact:      "high",
                SuggestedConfig: fmt.Sprintf(`# Increase worker connections (current: %d)
worker_connections %d;

# Add connection queue
upstream backend {
    zone backend_zone 64k;
    server backend:8080;
    queue 100 timeout=30s;
}

# Implement graceful degradation
limit_conn_zone $binary_remote_addr zone=addr:10m;
limit_conn addr 100;
limit_conn_status 503;`, ctx.WorkerConnections, ctx.WorkerConnections*2),
            }
        },
    },
    
    // 504 Gateway Timeout
    {
        ID:       "504-timeout-optimization",
        Name:     "Gateway Timeout Optimization",
        Category: "performance",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.Error504Rate > 0.1
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Optimize Gateway Timeout Settings",
                Description: fmt.Sprintf("%.2f%% gateway timeouts - backends are responding too slowly", ctx.Error504Rate),
                Impact:      "high",
                SuggestedConfig: fmt.Sprintf(`# Current average upstream response: %.2fms
# Recommended timeout: %.0fms (2x P95)

proxy_connect_timeout 10s;
proxy_send_timeout 90s;
proxy_read_timeout 90s;

# Enable buffering for slow clients
proxy_buffering on;
proxy_buffer_size 4k;
proxy_buffers 8 32k;
proxy_busy_buffers_size 64k;

# Consider async/non-blocking for slow endpoints
location /slow-api {
    proxy_pass http://backend;
    proxy_read_timeout 300s;  # Longer timeout for specific endpoints
}`, ctx.AvgUpstreamLatency, ctx.P95UpstreamLatency*2),
            }
        },
    },
    
    // High 4xx Rate
    {
        ID:       "4xx-request-validation",
        Name:     "Request Validation Improvements",
        Category: "security",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.Error4xxRate > 5.0
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Implement Request Validation",
                Description: fmt.Sprintf("%.2f%% of requests result in 4xx errors", ctx.Error4xxRate),
                Impact:      "medium",
                SuggestedConfig: `# Validate request size
client_max_body_size 10m;
client_body_buffer_size 128k;

# Block malformed requests
if ($request_method !~ ^(GET|POST|PUT|DELETE|PATCH|OPTIONS)$) {
    return 444;
}

# Custom error pages
error_page 400 401 403 404 /custom_error.html;
location = /custom_error.html {
    internal;
    root /usr/share/nginx/html;
}`,
            }
        },
    },
    
    // Log Rotation Recommendation
    {
        ID:       "log-rotation",
        Name:     "Log Rotation Configuration",
        Category: "operations",
        Condition: func(ctx *AnalysisContext) bool {
            return ctx.LogSizeBytes > 1024*1024*1024 // >1GB
        },
        Generate: func(ctx *AnalysisContext) *Recommendation {
            return &Recommendation{
                Title:       "Configure Log Rotation",
                Description: fmt.Sprintf("Access logs are %s - rotation recommended", formatBytes(ctx.LogSizeBytes)),
                Impact:      "medium",
                SuggestedConfig: `# /etc/logrotate.d/nginx
/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 \`cat /var/run/nginx.pid\`
    endscript
}

# NGINX config for log buffering
access_log /var/log/nginx/access.log combined buffer=64k flush=5s;
error_log /var/log/nginx/error.log warn;`,
            }
        },
    },
}
```

### 6.2 LLM-Enhanced Recommendations

```go
func (re *RecommendationEngine) GenerateAIRecommendations(ctx context.Context, analysisCtx *AnalysisContext) ([]*Recommendation, error) {
    // 1. Gather context for LLM
    prompt := re.buildPrompt(analysisCtx)
    
    // 2. Check cache first
    cacheKey := re.computeCacheKey(analysisCtx)
    if cached := re.cache.Get(cacheKey); cached != nil {
        return cached.([]*Recommendation), nil
    }
    
    // 3. Call LLM
    resp, err := re.llmClient.GenerateRecommendation(ctx, &RecommendationRequest{
        Prompt:          prompt,
        ErrorPatterns:   analysisCtx.ErrorPatterns,
        SystemMetrics:   analysisCtx.Metrics,
        CurrentConfig:   analysisCtx.NginxConfig,
        MaxTokens:       2000,
        Temperature:     0.3, // Lower temperature for more consistent output
    })
    if err != nil {
        // Fallback to rule-based recommendations
        log.Printf("LLM recommendation failed, using rules: %v", err)
        return re.generateRuleBasedRecommendations(analysisCtx), nil
    }
    
    // 4. Parse and validate LLM response
    recommendations, err := re.parseLLMResponse(resp)
    if err != nil {
        return re.generateRuleBasedRecommendations(analysisCtx), nil
    }
    
    // 5. Enrich with confidence scores
    for _, r := range recommendations {
        r.Confidence = resp.Confidence
        r.ModelUsed = re.llmClient.GetModelName()
    }
    
    // 6. Cache results
    re.cache.Set(cacheKey, recommendations, 1*time.Hour)
    
    return recommendations, nil
}
```

---

## 7. API Design

### 7.1 Proto Extensions

```protobuf
// Add to agent.proto

// Error Analysis Service
service ErrorAnalysisService {
    // Get error analysis for a time window
    rpc GetErrorAnalysis(ErrorAnalysisRequest) returns (ErrorAnalysisResponse);
    
    // Stream real-time error events
    rpc StreamErrorEvents(ErrorStreamRequest) returns (stream ErrorEvent);
    
    // Get AI-powered recommendations
    rpc GetAIRecommendations(AIRecommendationRequest) returns (AIRecommendationResponse);
    
    // Apply a recommendation
    rpc ApplyRecommendation(ApplyRecommendationRequest) returns (ApplyRecommendationResponse);
    
    // Get anomaly events
    rpc GetAnomalies(AnomalyRequest) returns (AnomalyResponse);
    
    // Feedback on recommendations
    rpc SubmitFeedback(FeedbackRequest) returns (FeedbackResponse);
}

message ErrorAnalysisRequest {
    string time_window = 1;           // 1h, 6h, 24h, 7d
    string agent_id = 2;              // Optional: specific agent
    repeated int32 status_codes = 3;  // Optional: filter by status codes
    string environment_id = 4;        // Optional: filter by environment
}

message ErrorAnalysisResponse {
    ErrorSummary summary = 1;
    repeated ErrorPattern patterns = 2;
    repeated ErrorCluster clusters = 3;
    repeated TimeSeriesPoint error_trend = 4;
    repeated EndpointErrorStat top_error_endpoints = 5;
    AIAnalysis ai_analysis = 6;
}

message ErrorSummary {
    uint64 total_errors = 1;
    float error_rate = 2;
    float error_rate_delta = 3;
    map<string, uint64> errors_by_status = 4;   // "4xx" -> count
    map<string, uint64> errors_by_category = 5; // "timeout" -> count
    string most_affected_endpoint = 6;
    string primary_root_cause = 7;
}

message ErrorPattern {
    string fingerprint = 1;
    int32 status_code = 2;
    string uri_pattern = 3;
    string method = 4;
    string category = 5;
    string severity = 6;
    uint64 occurrence_count = 7;
    int64 first_seen = 8;
    int64 last_seen = 9;
    repeated string root_causes = 10;
    float avg_latency = 11;
    float p95_latency = 12;
    repeated string affected_agents = 13;
}

message ErrorCluster {
    string cluster_id = 1;
    string name = 2;              // AI-generated cluster name
    string description = 3;       // AI-generated description
    repeated string fingerprints = 4;
    uint64 total_errors = 5;
    string severity = 6;
    string root_cause = 7;
}

message AIAnalysis {
    string root_cause_analysis = 1;
    string impact_assessment = 2;
    repeated string recommended_actions = 3;
    string config_suggestions = 4;
    float confidence = 5;
    string model_used = 6;
    int64 generated_at = 7;
}

message AIRecommendationRequest {
    string time_window = 1;
    string agent_id = 2;
    string category = 3;          // performance, security, reliability, all
    bool include_applied = 4;     // Include already-applied recommendations
    bool force_refresh = 5;       // Skip cache
}

message AIRecommendationResponse {
    repeated AIRecommendation recommendations = 1;
    int64 generated_at = 2;
    string model_used = 3;
}

message AIRecommendation {
    string id = 1;
    string title = 2;
    string description = 3;
    string category = 4;          // performance, security, reliability, cost
    string impact = 5;            // high, medium, low
    string problem = 6;           // What's happening
    string solution = 7;          // What to do
    string current_config = 8;
    string suggested_config = 9;
    repeated string affected_directives = 10;
    string estimated_improvement = 11;
    repeated string risks = 12;
    float confidence = 13;
    repeated string based_on_errors = 14; // Error fingerprints
    string status = 15;           // pending, applied, dismissed
}

message ApplyRecommendationRequest {
    string recommendation_id = 1;
    string agent_id = 2;
    bool dry_run = 3;             // Preview changes without applying
}

message ApplyRecommendationResponse {
    bool success = 1;
    string message = 2;
    string preview = 3;           // Config preview for dry_run
    string backup_path = 4;       // Path to backup config
}

message ErrorEvent {
    int64 timestamp = 1;
    string fingerprint = 2;
    int32 status_code = 3;
    string uri = 4;
    string method = 5;
    string agent_id = 6;
    string category = 7;
    string severity = 8;
    float latency = 9;
    string upstream_status = 10;
}

message AnomalyRequest {
    string time_window = 1;
    string severity = 2;          // critical, warning, info, all
}

message AnomalyResponse {
    repeated Anomaly anomalies = 1;
}

message Anomaly {
    string id = 1;
    int64 timestamp = 2;
    string type = 3;              // spike, drop, pattern_change
    string metric = 4;
    float current_value = 5;
    float baseline_value = 6;
    float deviation_percent = 7;
    string severity = 8;
    repeated string affected_agents = 9;
    repeated string affected_endpoints = 10;
    bool auto_resolved = 11;
    int64 resolution_time = 12;
}

message FeedbackRequest {
    string recommendation_id = 1;
    string feedback = 2;          // helpful, not_helpful, incorrect
    string comment = 3;           // Optional user comment
}

message FeedbackResponse {
    bool success = 1;
}
```

### 7.2 REST API Endpoints

```go
// REST API handlers
func (s *Server) registerErrorAnalysisRoutes() {
    // Error Analysis
    s.router.GET("/api/v1/errors/analysis", s.handleGetErrorAnalysis)
    s.router.GET("/api/v1/errors/patterns", s.handleGetErrorPatterns)
    s.router.GET("/api/v1/errors/clusters", s.handleGetErrorClusters)
    s.router.GET("/api/v1/errors/trends", s.handleGetErrorTrends)
    
    // AI Recommendations
    s.router.GET("/api/v1/recommendations", s.handleGetRecommendations)
    s.router.POST("/api/v1/recommendations/:id/apply", s.handleApplyRecommendation)
    s.router.POST("/api/v1/recommendations/:id/dismiss", s.handleDismissRecommendation)
    s.router.POST("/api/v1/recommendations/:id/feedback", s.handleRecommendationFeedback)
    
    // Anomalies
    s.router.GET("/api/v1/anomalies", s.handleGetAnomalies)
    s.router.POST("/api/v1/anomalies/:id/acknowledge", s.handleAcknowledgeAnomaly)
    
    // WebSocket for real-time events
    s.router.GET("/api/v1/errors/stream", s.handleErrorStream)
    
    // LLM Configuration (Admin only)
    s.router.GET("/api/v1/admin/llm/config", s.handleGetLLMConfig)
    s.router.PUT("/api/v1/admin/llm/config", s.handleUpdateLLMConfig)
    s.router.POST("/api/v1/admin/llm/test", s.handleTestLLMConnection)
}
```

---

## 8. Frontend Components

### 8.1 Error Analysis Dashboard

```typescript
// frontend/src/app/errors/page.tsx

interface ErrorAnalysisData {
  summary: ErrorSummary;
  patterns: ErrorPattern[];
  clusters: ErrorCluster[];
  errorTrend: TimeSeriesPoint[];
  topErrorEndpoints: EndpointErrorStat[];
  aiAnalysis?: AIAnalysis;
}

export default function ErrorAnalysisPage() {
  const [timeWindow, setTimeWindow] = useState('24h');
  const [data, setData] = useState<ErrorAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  return (
    <div className="p-6 space-y-6">
      {/* Header with Time Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Error Analysis</h1>
          <p className="text-muted-foreground">
            AI-powered error detection and recommendations
          </p>
        </div>
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ErrorSummaryCard
          title="Total Errors"
          value={data?.summary.totalErrors || 0}
          delta={data?.summary.errorRateDelta}
          severity={getSeverity(data?.summary.errorRate)}
        />
        <ErrorSummaryCard
          title="Error Rate"
          value={`${data?.summary.errorRate?.toFixed(2)}%`}
          baseline="Target: <1%"
        />
        <ErrorSummaryCard
          title="5xx Errors"
          value={data?.summary.errorsByStatus?.['5xx'] || 0}
          severity="critical"
        />
        <ErrorSummaryCard
          title="Client Timeouts (499)"
          value={data?.summary.errorsByStatus?.['499'] || 0}
          severity="warning"
        />
      </div>

      {/* AI Analysis Card */}
      {data?.aiAnalysis && (
        <AIAnalysisCard analysis={data.aiAnalysis} />
      )}

      {/* Error Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Error Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorTrendChart data={data?.errorTrend || []} />
        </CardContent>
      </Card>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="patterns">
        <TabsList>
          <TabsTrigger value="patterns">Error Patterns</TabsTrigger>
          <TabsTrigger value="clusters">AI Clusters</TabsTrigger>
          <TabsTrigger value="endpoints">Top Error Endpoints</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns">
          <ErrorPatternsTable patterns={data?.patterns || []} />
        </TabsContent>

        <TabsContent value="clusters">
          <ErrorClustersView clusters={data?.clusters || []} />
        </TabsContent>

        <TabsContent value="endpoints">
          <TopErrorEndpointsTable endpoints={data?.topErrorEndpoints || []} />
        </TabsContent>

        <TabsContent value="timeline">
          <ErrorTimeline />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 8.2 AI Recommendations Component

```typescript
// frontend/src/components/ai-recommendations.tsx

interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'performance' | 'security' | 'reliability' | 'cost';
  impact: 'high' | 'medium' | 'low';
  problem: string;
  solution: string;
  currentConfig: string;
  suggestedConfig: string;
  estimatedImprovement: string;
  confidence: number;
  status: 'pending' | 'applied' | 'dismissed';
}

export function AIRecommendationsPanel() {
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [selectedRec, setSelectedRec] = useState<AIRecommendation | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Recommendations
          </CardTitle>
          <CardDescription>
            Intelligent suggestions based on error patterns
          </CardDescription>
        </div>
        <Button variant="outline" onClick={refreshRecommendations}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onApply={() => {
                setSelectedRec(rec);
                setApplyDialogOpen(true);
              }}
              onDismiss={() => dismissRecommendation(rec.id)}
            />
          ))}
        </div>
      </CardContent>

      {/* Apply Recommendation Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Apply Recommendation</DialogTitle>
            <DialogDescription>
              Review the configuration changes before applying
            </DialogDescription>
          </DialogHeader>

          {selectedRec && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Current Configuration</Label>
                  <CodeBlock language="nginx" code={selectedRec.currentConfig} />
                </div>
                <div>
                  <Label>Suggested Configuration</Label>
                  <CodeBlock language="nginx" code={selectedRec.suggestedConfig} />
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Impact Assessment</AlertTitle>
                <AlertDescription>
                  {selectedRec.estimatedImprovement}
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-2">
                <Badge variant={getImpactVariant(selectedRec.impact)}>
                  {selectedRec.impact} impact
                </Badge>
                <Badge variant="outline">
                  {(selectedRec.confidence * 100).toFixed(0)}% confidence
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => previewChanges(selectedRec)}>
              Preview (Dry Run)
            </Button>
            <Button onClick={() => applyRecommendation(selectedRec)}>
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RecommendationCard({ 
  recommendation, 
  onApply, 
  onDismiss 
}: RecommendationCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {getCategoryIcon(recommendation.category)}
            <h4 className="font-medium">{recommendation.title}</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            {recommendation.description}
          </p>
        </div>
        <Badge variant={getImpactVariant(recommendation.impact)}>
          {recommendation.impact}
        </Badge>
      </div>

      <div className="bg-muted rounded p-3">
        <p className="text-sm"><strong>Problem:</strong> {recommendation.problem}</p>
        <p className="text-sm mt-1"><strong>Solution:</strong> {recommendation.solution}</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>{(recommendation.confidence * 100).toFixed(0)}% confidence</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button size="sm" onClick={onApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 8.3 Error Trend Visualization

```typescript
// frontend/src/components/error-trend-chart.tsx

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface ErrorTrendChartProps {
  data: TimeSeriesPoint[];
  showBaseline?: boolean;
}

export function ErrorTrendChart({ data, showBaseline = true }: ErrorTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="error5xxGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis 
          dataKey="time" 
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip 
          content={<CustomTooltip />}
          cursor={{ strokeDasharray: '3 3' }}
        />
        <Area 
          type="monotone" 
          dataKey="errors_4xx" 
          stroke="hsl(var(--warning))" 
          fill="url(#errorGradient)"
          name="4xx Errors"
        />
        <Area 
          type="monotone" 
          dataKey="errors_5xx" 
          stroke="hsl(var(--destructive))" 
          fill="url(#error5xxGradient)"
          name="5xx Errors"
        />
        <Area 
          type="monotone" 
          dataKey="errors_499" 
          stroke="hsl(var(--chart-3))" 
          fill="none"
          strokeDasharray="5 5"
          name="499 (Client Closed)"
        />
        {showBaseline && (
          <Line 
            type="monotone" 
            dataKey="baseline" 
            stroke="hsl(var(--muted-foreground))" 
            strokeDasharray="3 3"
            dot={false}
            name="Baseline"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

---

## 9. Enterprise Scalability

### 9.1 Kafka Integration (Optional)

```go
// High-volume error event streaming
type KafkaConfig struct {
    Brokers         []string
    ErrorEventTopic string
    RecommendationTopic string
    AnomalyTopic    string
    ConsumerGroup   string
    Compression     string
    BatchSize       int
    LingerMs        int
}

type ErrorEventProducer struct {
    producer *kafka.Producer
    topic    string
}

func (p *ErrorEventProducer) PublishError(ctx context.Context, event *ErrorEvent) error {
    data, _ := json.Marshal(event)
    return p.producer.Produce(&kafka.Message{
        TopicPartition: kafka.TopicPartition{
            Topic:     &p.topic,
            Partition: kafka.PartitionAny,
        },
        Key:   []byte(event.Fingerprint),
        Value: data,
    }, nil)
}

// Consumer for async processing
type ErrorEventConsumer struct {
    consumer      *kafka.Consumer
    processor     *ErrorProcessor
    llmClient     LLMClient
    batchSize     int
    batchTimeout  time.Duration
}

func (c *ErrorEventConsumer) Run(ctx context.Context) {
    batch := make([]*ErrorEvent, 0, c.batchSize)
    ticker := time.NewTicker(c.batchTimeout)
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            if len(batch) > 0 {
                c.processBatch(batch)
                batch = batch[:0]
            }
        default:
            msg, err := c.consumer.ReadMessage(100 * time.Millisecond)
            if err != nil {
                continue
            }
            
            var event ErrorEvent
            json.Unmarshal(msg.Value, &event)
            batch = append(batch, &event)
            
            if len(batch) >= c.batchSize {
                c.processBatch(batch)
                batch = batch[:0]
            }
        }
    }
}
```

### 9.2 Horizontal Scaling

```yaml
# Kubernetes deployment for error analysis workers
apiVersion: apps/v1
kind: Deployment
metadata:
  name: error-analysis-worker
  namespace: avika
spec:
  replicas: 3
  selector:
    matchLabels:
      app: error-analysis-worker
  template:
    metadata:
      labels:
        app: error-analysis-worker
    spec:
      containers:
      - name: worker
        image: hellodk/avika-gateway:latest
        command: ["./gateway", "--mode=worker"]
        env:
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: LLM_PROVIDER
          value: "openai"
        - name: LLM_API_KEY
          valueFrom:
            secretKeyRef:
              name: llm-secrets
              key: openai-api-key
        - name: CLICKHOUSE_ADDR
          value: "clickhouse:9000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
# HPA for auto-scaling based on Kafka lag
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: error-analysis-worker-hpa
  namespace: avika
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: error-analysis-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: External
    external:
      metric:
        name: kafka_consumer_lag
        selector:
          matchLabels:
            topic: error-events
      target:
        type: AverageValue
        averageValue: "1000"
```

### 9.3 Multi-Tenancy Support

```go
// Tenant-aware error processing
type TenantContext struct {
    TenantID      string
    ProjectID     string
    EnvironmentID string
    LLMQuota      *LLMQuota
    Preferences   *TenantPreferences
}

type LLMQuota struct {
    DailyTokenLimit    int64
    TokensUsedToday    int64
    RequestsPerMinute  int
    RequestsThisMinute int
}

func (ep *ErrorProcessor) ProcessErrorWithTenant(ctx context.Context, entry *pb.LogEntry, tenant *TenantContext) error {
    // Check LLM quota
    if !tenant.LLMQuota.CanMakeRequest() {
        return ep.processWithoutLLM(entry, tenant)
    }
    
    // Process with tenant-specific settings
    return ep.processWithLLM(ctx, entry, tenant)
}
```

### 9.4 Rate Limiting for LLM Calls

```go
type LLMRateLimiter struct {
    limiter  *rate.Limiter
    mu       sync.Mutex
    tokens   int64
    maxDaily int64
}

func (rl *LLMRateLimiter) Allow() bool {
    if !rl.limiter.Allow() {
        return false
    }
    
    rl.mu.Lock()
    defer rl.mu.Unlock()
    
    if rl.tokens >= rl.maxDaily {
        return false
    }
    
    return true
}

func (rl *LLMRateLimiter) RecordUsage(tokens int64) {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    rl.tokens += tokens
}
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)
- [ ] Create new ClickHouse tables for error patterns and analysis
- [ ] Implement error fingerprinting and classification
- [ ] Build basic pattern detection engine
- [ ] Add API endpoints for error analysis

### Phase 2: AI Integration (2-3 weeks)
- [ ] Implement LLM client abstraction (OpenAI, Claude, Ollama)
- [ ] Build prompt templates for error analysis
- [ ] Add caching layer for LLM responses
- [ ] Create recommendation engine with rule-based fallback

### Phase 3: Frontend (2 weeks)
- [ ] Build error analysis dashboard
- [ ] Create AI recommendations panel
- [ ] Implement recommendation apply flow
- [ ] Add error trend visualizations

### Phase 4: Enterprise Features (2-3 weeks)
- [ ] Add Kafka integration for high-volume processing
- [ ] Implement anomaly detection with baseline learning
- [ ] Add multi-tenancy and quota management
- [ ] Build admin UI for LLM configuration

### Phase 5: Polish & Scale (1-2 weeks)
- [ ] Performance optimization and load testing
- [ ] Documentation and runbooks
- [ ] Feedback collection and model tuning
- [ ] Monitoring and alerting for the AI system itself

---

## Appendix A: NGINX Tuning Reference

### Common Error Resolution Matrix

| Error Code | Common Causes | Tuning Parameters |
|------------|--------------|-------------------|
| **499** | Slow backend, client timeout | `proxy_read_timeout`, `proxy_connect_timeout`, `keepalive` |
| **502** | Upstream down, socket error | `upstream health_check`, `proxy_next_upstream`, `max_fails` |
| **503** | Overload, rate limit | `worker_connections`, `limit_conn`, `upstream queue` |
| **504** | Backend timeout | `proxy_read_timeout`, `proxy_send_timeout`, buffering |
| **400** | Malformed request | `client_body_buffer_size`, `large_client_header_buffers` |
| **413** | Body too large | `client_max_body_size`, `client_body_buffer_size` |
| **429** | Rate limited | `limit_req_zone`, `limit_req`, burst settings |

### Recommended NGINX Configuration for High Availability

```nginx
# Worker tuning
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Timeouts
    keepalive_timeout 65;
    keepalive_requests 1000;
    
    client_body_timeout 30s;
    client_header_timeout 30s;
    send_timeout 30s;
    
    # Proxy settings
    proxy_connect_timeout 10s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 32k;
    proxy_busy_buffers_size 64k;
    
    # Upstream with health checks
    upstream backend {
        zone backend_zone 64k;
        
        server backend1:8080 max_fails=3 fail_timeout=30s;
        server backend2:8080 max_fails=3 fail_timeout=30s;
        server backend3:8080 backup;
        
        keepalive 32;
        keepalive_timeout 60s;
    }
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=addr:10m;
    
    server {
        listen 80;
        
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            limit_conn addr 100;
            
            proxy_pass http://backend;
            proxy_next_upstream error timeout http_502 http_503;
            proxy_next_upstream_tries 3;
        }
    }
}
```

---

## Appendix B: LLM Provider Comparison

| Provider | Model | Latency | Cost | Best For |
|----------|-------|---------|------|----------|
| **OpenAI** | GPT-4 Turbo | ~2-5s | $$$$ | Complex analysis, high accuracy |
| **OpenAI** | GPT-3.5 Turbo | ~1-2s | $$ | Quick recommendations |
| **Anthropic** | Claude 3 Opus | ~3-6s | $$$$ | Long context, detailed analysis |
| **Anthropic** | Claude 3 Haiku | ~1-2s | $ | Fast, cost-effective |
| **Ollama** | Llama 2 70B | ~5-10s | Free (self-hosted) | Air-gapped, privacy-focused |
| **Ollama** | Mistral 7B | ~1-3s | Free (self-hosted) | Edge deployment |

---

*Document Version: 1.0*
*Last Updated: March 2026*
