package main

import (
	"encoding/json"
	"net/http"
	"regexp"
)

type ConfigScoreCheck struct {
	ID          string `json:"id"`
	Category    string `json:"category"` // security, performance, reliability
	Name        string `json:"name"`
	Description string `json:"description"`
	Passed      bool   `json:"passed"`
	Impact      int    `json:"impact"` // Weight on the final score (e.g., 5, 10, 20)
}

type ConfigScoreResult struct {
	Score  int                `json:"score"` // 0-100
	Checks []ConfigScoreCheck `json:"checks"`
}

var configRules = []struct {
	ID          string
	Category    string
	Name        string
	Description string
	Impact      int
	Regex       *regexp.Regexp
}{
	// Security
	{
		ID:          "sec-server-tokens",
		Category:    "security",
		Name:        "Hide Server Tokens",
		Description: "server_tokens off; prevents NGINX from broadcasting its version.",
		Impact:      10,
		Regex:       regexp.MustCompile(`server_tokens\s+off\s*;`),
	},
	{
		ID:          "sec-client-max-body",
		Category:    "security",
		Name:        "Limit Request Body Size",
		Description: "client_max_body_size limits payload size and mitigates DoS.",
		Impact:      10,
		Regex:       regexp.MustCompile(`client_max_body_size\s+[0-9]+[kmgKMG]?\s*;`),
	},
	{
		ID:          "sec-ssl-protocols",
		Category:    "security",
		Name:        "Secure SSL Protocols",
		Description: "Disable older SSL/TLS protocols (TLSv1, TLSv1.1).",
		Impact:      15,
		Regex:       regexp.MustCompile(`ssl_protocols\s+[^;]*TLSv1\.[23][^;]*;`),
	},
	// Performance
	{
		ID:          "perf-worker-proc",
		Category:    "performance",
		Name:        "Auto Worker Processes",
		Description: "worker_processes auto; ensures optimal CPU utilization.",
		Impact:      10,
		Regex:       regexp.MustCompile(`worker_processes\s+auto\s*;`),
	},
	{
		ID:          "perf-gzip",
		Category:    "performance",
		Name:        "Enable Gzip Compression",
		Description: "gzip on; compresses payload to reduce bandwidth.",
		Impact:      10,
		Regex:       regexp.MustCompile(`gzip\s+on\s*;`),
	},
	{
		ID:          "perf-keepalive",
		Category:    "performance",
		Name:        "Keepalive Timeout",
		Description: "keepalive_timeout maintains connections for subsequent requests.",
		Impact:      10,
		Regex:       regexp.MustCompile(`keepalive_timeout\s+[0-9]+s?\s*;`),
	},
	// Reliability
	{
		ID:          "rel-worker-conn",
		Category:    "reliability",
		Name:        "High Worker Connections",
		Description: "worker_connections should be >= 1024 for high traffic.",
		Impact:      15,
		// Using a simple regex to check if it's explicitly set. More complex checks require parsing.
		Regex: regexp.MustCompile(`worker_connections\s+(1024|[1-9][0-9]{3,})\s*;`),
	},
}

func evaluateConfigScore(configRaw string) ConfigScoreResult {
	result := ConfigScoreResult{
		Checks: make([]ConfigScoreCheck, 0),
	}

	totalPossible := 0
	totalEarned := 0

	for _, rule := range configRules {
		passed := rule.Regex.MatchString(configRaw)
		totalPossible += rule.Impact
		if passed {
			totalEarned += rule.Impact
		}

		result.Checks = append(result.Checks, ConfigScoreCheck{
			ID:          rule.ID,
			Category:    rule.Category,
			Name:        rule.Name,
			Description: rule.Description,
			Passed:      passed,
			Impact:      rule.Impact,
		})
	}

	if totalPossible > 0 {
		result.Score = (totalEarned * 100) / totalPossible
	} else {
		result.Score = 100
	}

	return result
}

// API Handler
func (s *server) handleScoreConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Config string `json:"config"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	res := evaluateConfigScore(req.Config)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
