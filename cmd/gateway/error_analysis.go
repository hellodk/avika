package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// ErrorCategory defines classification for HTTP errors
type ErrorCategory struct {
	Code        int
	Category    string
	Severity    string   // critical, warning, info
	RootCauses  []string // Possible root causes
	Tuning      []string // Related NGINX tuning parameters
	Description string
}

// ErrorFingerprint uniquely identifies an error pattern
type ErrorFingerprint struct {
	StatusCode   int
	URIPattern   string
	Method       string
	UpstreamAddr string
	ErrorContext string
	Hash         string
}

// ErrorPattern represents a clustered group of similar errors
type ErrorPattern struct {
	Fingerprint     string
	StatusCode      int
	URIPattern      string
	Method          string
	Category        string
	Severity        string
	RootCauses      []string
	OccurrenceCount int64
	FirstSeen       time.Time
	LastSeen        time.Time
	AffectedAgents  []string
	SampleRequestIDs []string
	AvgLatency      float32
	MaxLatency      float32
	P95Latency      float32
}

// ErrorClassifications maps HTTP status codes to their classifications
var ErrorClassifications = map[int]ErrorCategory{
	// 4xx Client Errors
	400: {
		Code:        400,
		Category:    "bad_request",
		Severity:    "warning",
		RootCauses:  []string{"malformed_request", "invalid_headers", "body_too_large", "invalid_json"},
		Tuning:      []string{"client_body_buffer_size", "large_client_header_buffers"},
		Description: "The server cannot process the request due to client error",
	},
	401: {
		Code:        401,
		Category:    "authentication",
		Severity:    "warning",
		RootCauses:  []string{"missing_credentials", "expired_token", "invalid_token", "auth_server_down"},
		Tuning:      []string{"auth_basic", "auth_jwt", "proxy_pass_header"},
		Description: "Authentication is required but missing or invalid",
	},
	403: {
		Code:        403,
		Category:    "authorization",
		Severity:    "warning",
		RootCauses:  []string{"ip_blocked", "rate_limited", "waf_blocked", "permission_denied", "geo_blocked"},
		Tuning:      []string{"allow/deny", "limit_req", "limit_conn", "geo"},
		Description: "The server understood the request but refuses to authorize it",
	},
	404: {
		Code:        404,
		Category:    "not_found",
		Severity:    "info",
		RootCauses:  []string{"missing_resource", "wrong_path", "broken_link", "removed_content", "typo"},
		Tuning:      []string{"try_files", "error_page", "rewrite", "location"},
		Description: "The requested resource could not be found",
	},
	405: {
		Code:        405,
		Category:    "method_not_allowed",
		Severity:    "info",
		RootCauses:  []string{"wrong_http_method", "api_misconfiguration", "cors_issue"},
		Tuning:      []string{"limit_except", "add_header"},
		Description: "The HTTP method is not allowed for this resource",
	},
	408: {
		Code:        408,
		Category:    "request_timeout",
		Severity:    "warning",
		RootCauses:  []string{"client_slow", "network_issues", "large_upload", "connection_drop"},
		Tuning:      []string{"client_body_timeout", "client_header_timeout", "send_timeout"},
		Description: "The client did not produce a request within the server timeout",
	},
	413: {
		Code:        413,
		Category:    "payload_too_large",
		Severity:    "warning",
		RootCauses:  []string{"file_upload_limit", "body_size_exceeded", "attack_attempt"},
		Tuning:      []string{"client_max_body_size", "client_body_buffer_size"},
		Description: "The request payload exceeds the server's configured limit",
	},
	414: {
		Code:        414,
		Category:    "uri_too_long",
		Severity:    "warning",
		RootCauses:  []string{"query_string_too_long", "redirect_loop", "malicious_request"},
		Tuning:      []string{"large_client_header_buffers"},
		Description: "The request URI is too long for the server to process",
	},
	429: {
		Code:        429,
		Category:    "rate_limited",
		Severity:    "warning",
		RootCauses:  []string{"too_many_requests", "api_quota_exceeded", "ddos_protection", "burst_traffic"},
		Tuning:      []string{"limit_req_zone", "limit_req", "limit_conn", "limit_rate"},
		Description: "Too many requests - rate limit exceeded",
	},
	499: {
		Code:        499,
		Category:    "client_closed",
		Severity:    "warning",
		RootCauses:  []string{"slow_backend", "impatient_client", "timeout_mismatch", "network_drop", "user_cancelled"},
		Tuning:      []string{"proxy_read_timeout", "proxy_connect_timeout", "keepalive_timeout", "proxy_buffering"},
		Description: "Client closed connection before server responded (NGINX-specific)",
	},

	// 5xx Server Errors
	500: {
		Code:        500,
		Category:    "internal_error",
		Severity:    "critical",
		RootCauses:  []string{"application_crash", "script_error", "config_error", "memory_exhaustion", "unhandled_exception"},
		Tuning:      []string{"error_log", "fastcgi_params", "proxy_pass", "uwsgi_params"},
		Description: "The server encountered an unexpected condition",
	},
	502: {
		Code:        502,
		Category:    "bad_gateway",
		Severity:    "critical",
		RootCauses:  []string{"upstream_down", "upstream_crashed", "socket_error", "dns_failure", "connection_refused"},
		Tuning:      []string{"upstream", "proxy_next_upstream", "resolver", "health_check"},
		Description: "The server received an invalid response from an upstream server",
	},
	503: {
		Code:        503,
		Category:    "service_unavailable",
		Severity:    "critical",
		RootCauses:  []string{"overloaded", "maintenance", "circuit_breaker", "all_upstreams_down", "resource_exhaustion"},
		Tuning:      []string{"worker_connections", "upstream queue", "limit_conn_zone", "proxy_next_upstream"},
		Description: "The server is currently unable to handle the request",
	},
	504: {
		Code:        504,
		Category:    "gateway_timeout",
		Severity:    "critical",
		RootCauses:  []string{"upstream_slow", "database_slow", "external_api_slow", "deadlock", "resource_contention"},
		Tuning:      []string{"proxy_read_timeout", "proxy_connect_timeout", "proxy_send_timeout", "fastcgi_read_timeout"},
		Description: "The upstream server failed to respond in time",
	},
	520: {
		Code:        520,
		Category:    "unknown_error",
		Severity:    "critical",
		RootCauses:  []string{"empty_response", "header_too_large", "connection_reset"},
		Tuning:      []string{"proxy_buffer_size", "proxy_buffers"},
		Description: "Unknown error (often Cloudflare-specific)",
	},
	521: {
		Code:        521,
		Category:    "web_server_down",
		Severity:    "critical",
		RootCauses:  []string{"origin_offline", "firewall_blocked", "port_closed"},
		Tuning:      []string{"upstream", "resolver"},
		Description: "The origin web server is down",
	},
	522: {
		Code:        522,
		Category:    "connection_timed_out",
		Severity:    "critical",
		RootCauses:  []string{"network_issues", "firewall_timeout", "overloaded_server"},
		Tuning:      []string{"proxy_connect_timeout", "keepalive"},
		Description: "Connection to origin server timed out",
	},
}

// ErrorClassifier classifies HTTP errors based on status codes and context
type ErrorClassifier struct {
	customRules []ClassificationRule
}

// ClassificationRule defines a custom classification rule
type ClassificationRule struct {
	Name      string
	Priority  int
	Condition func(*pb.LogEntry) bool
	Classify  func(*pb.LogEntry) *ErrorCategory
}

// NewErrorClassifier creates a new error classifier
func NewErrorClassifier() *ErrorClassifier {
	ec := &ErrorClassifier{
		customRules: make([]ClassificationRule, 0),
	}
	ec.addDefaultRules()
	return ec
}

// addDefaultRules adds built-in classification rules
func (ec *ErrorClassifier) addDefaultRules() {
	// Rule: 502 with empty upstream status likely means upstream is completely down
	ec.customRules = append(ec.customRules, ClassificationRule{
		Name:     "502_upstream_down",
		Priority: 10,
		Condition: func(entry *pb.LogEntry) bool {
			return entry.Status == 502 && entry.UpstreamStatus == ""
		},
		Classify: func(entry *pb.LogEntry) *ErrorCategory {
			cat := ErrorClassifications[502]
			cat.RootCauses = []string{"upstream_completely_down", "connection_refused"}
			cat.Severity = "critical"
			return &cat
		},
	})

	// Rule: 499 with high latency means backend too slow
	ec.customRules = append(ec.customRules, ClassificationRule{
		Name:     "499_slow_backend",
		Priority: 10,
		Condition: func(entry *pb.LogEntry) bool {
			return entry.Status == 499 && entry.RequestTime > 5.0
		},
		Classify: func(entry *pb.LogEntry) *ErrorCategory {
			cat := ErrorClassifications[499]
			cat.RootCauses = []string{"extremely_slow_backend", "backend_timeout"}
			cat.Severity = "critical"
			return &cat
		},
	})

	// Rule: 504 with specific upstream timeout pattern
	ec.customRules = append(ec.customRules, ClassificationRule{
		Name:     "504_upstream_timeout",
		Priority: 10,
		Condition: func(entry *pb.LogEntry) bool {
			return entry.Status == 504 && entry.UpstreamResponseTime > 60
		},
		Classify: func(entry *pb.LogEntry) *ErrorCategory {
			cat := ErrorClassifications[504]
			cat.RootCauses = []string{"upstream_timeout_exceeded", "database_deadlock", "external_api_timeout"}
			return &cat
		},
	})
}

// Classify returns the error classification for a log entry
func (ec *ErrorClassifier) Classify(entry *pb.LogEntry) *ErrorCategory {
	// Check custom rules first (higher priority)
	for _, rule := range ec.customRules {
		if rule.Condition(entry) {
			return rule.Classify(entry)
		}
	}

	// Fall back to standard classification
	if cat, ok := ErrorClassifications[int(entry.Status)]; ok {
		return &cat
	}

	// Generic classification for unknown status codes
	if entry.Status >= 500 {
		return &ErrorCategory{
			Code:        int(entry.Status),
			Category:    "server_error",
			Severity:    "critical",
			RootCauses:  []string{"unknown_server_error"},
			Tuning:      []string{"error_log"},
			Description: fmt.Sprintf("Server error with status code %d", entry.Status),
		}
	} else if entry.Status >= 400 {
		return &ErrorCategory{
			Code:        int(entry.Status),
			Category:    "client_error",
			Severity:    "warning",
			RootCauses:  []string{"unknown_client_error"},
			Tuning:      []string{"error_page"},
			Description: fmt.Sprintf("Client error with status code %d", entry.Status),
		}
	}

	return nil
}

// GenerateFingerprint creates a unique signature for error grouping
func GenerateFingerprint(entry *pb.LogEntry) *ErrorFingerprint {
	// Normalize URI by replacing dynamic segments with placeholders
	uriPattern := normalizeURI(entry.RequestUri)

	// Build fingerprint components
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

// normalizeURI replaces dynamic path segments with placeholders
func normalizeURI(uri string) string {
	// Remove query string
	if idx := strings.Index(uri, "?"); idx > 0 {
		uri = uri[:idx]
	}

	// Patterns to normalize
	patterns := []struct {
		regex       *regexp.Regexp
		replacement string
	}{
		// UUIDs
		{regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`), "{uuid}"},
		// Numeric IDs
		{regexp.MustCompile(`/\d+(/|$)`), "/{id}$1"},
		// Hex IDs (MongoDB ObjectIDs, etc.)
		{regexp.MustCompile(`/[0-9a-fA-F]{24}(/|$)`), "/{id}$1"},
		// Date patterns
		{regexp.MustCompile(`/\d{4}-\d{2}-\d{2}(/|$)`), "/{date}$1"},
		// Version numbers
		{regexp.MustCompile(`/v\d+(\.\d+)?(/|$)`), "/{version}$1"},
	}

	for _, p := range patterns {
		uri = p.regex.ReplaceAllString(uri, p.replacement)
	}

	return uri
}

// ErrorAnalysisContext holds context for error analysis
type ErrorAnalysisContext struct {
	// Error metrics
	Error4xxRate    float64
	Error5xxRate    float64
	Error499Rate    float64
	Error502Count   int64
	Error503Count   int64
	Error504Count   int64
	TotalErrors     int64
	TotalRequests   int64

	// System metrics
	CPUUsage          float64
	MemoryUsage       float64
	ActiveConnections int64
	WorkerConnections int64

	// Upstream metrics
	AvgUpstreamLatency float64
	P95UpstreamLatency float64
	UpstreamErrorRate  float64

	// Time context
	TimeWindow    time.Duration
	PeakHour      int
	TrafficSpike  bool

	// Current config context
	CurrentConfig *NginxConfigContext

	// Error patterns
	ErrorPatterns []*ErrorPattern
}

// NginxConfigContext holds relevant NGINX configuration
type NginxConfigContext struct {
	WorkerConnections   int
	ProxyReadTimeout    int
	ProxyConnectTimeout int
	ProxySendTimeout    int
	ClientMaxBodySize   string
	KeepaliveTimeout    int
	UpstreamConfig      string
}

// GetTimeouts returns timeout configuration as a string
func (c *NginxConfigContext) GetTimeouts() string {
	if c == nil {
		return "Configuration not available"
	}
	return fmt.Sprintf(`proxy_read_timeout %ds;
proxy_connect_timeout %ds;
proxy_send_timeout %ds;
keepalive_timeout %ds;`,
		c.ProxyReadTimeout,
		c.ProxyConnectTimeout,
		c.ProxySendTimeout,
		c.KeepaliveTimeout)
}

// ErrorSeverityLevel represents error severity for prioritization
type ErrorSeverityLevel int

const (
	SeverityInfo ErrorSeverityLevel = iota
	SeverityWarning
	SeverityCritical
)

// ParseSeverity converts severity string to level
func ParseSeverity(s string) ErrorSeverityLevel {
	switch strings.ToLower(s) {
	case "critical":
		return SeverityCritical
	case "warning":
		return SeverityWarning
	default:
		return SeverityInfo
	}
}

// String returns the string representation of severity
func (s ErrorSeverityLevel) String() string {
	switch s {
	case SeverityCritical:
		return "critical"
	case SeverityWarning:
		return "warning"
	default:
		return "info"
	}
}

// ErrorImpact estimates the user impact of an error pattern
type ErrorImpact struct {
	AffectedUsers    int64
	AffectedRequests int64
	BusinessImpact   string // high, medium, low
	Description      string
}

// CalculateImpact estimates the impact of an error pattern
func CalculateImpact(pattern *ErrorPattern, totalRequests int64) *ErrorImpact {
	impact := &ErrorImpact{
		AffectedRequests: pattern.OccurrenceCount,
	}

	// Calculate percentage of traffic affected
	percentage := float64(pattern.OccurrenceCount) / float64(totalRequests) * 100

	if percentage > 5 || pattern.Severity == "critical" {
		impact.BusinessImpact = "high"
		impact.Description = fmt.Sprintf("%.2f%% of traffic affected - immediate action required", percentage)
	} else if percentage > 1 || pattern.Severity == "warning" {
		impact.BusinessImpact = "medium"
		impact.Description = fmt.Sprintf("%.2f%% of traffic affected - should be addressed soon", percentage)
	} else {
		impact.BusinessImpact = "low"
		impact.Description = fmt.Sprintf("%.2f%% of traffic affected - monitor for changes", percentage)
	}

	return impact
}
