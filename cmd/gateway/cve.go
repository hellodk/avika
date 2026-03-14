package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// CVE represents a security vulnerability
type CVE struct {
	ID          string  `json:"id"`
	Severity    string  `json:"severity"` // "Critical", "High", "Medium", "Low"
	Score       float64 `json:"score"`
	Summary     string  `json:"summary"`
	FixedIn     string  `json:"fixed_in"`
	Description string  `json:"description"`
}

// nginxCVEs is a static database of known NGINX CVEs for demonstration
// In production, this would be updated from an external feed (NVD)
var nginxCVEs = map[string][]CVE{
	"1.25.0": {
		{ID: "CVE-2024-24989", Severity: "High", Score: 7.5, Summary: "HTTP/3 Denial of Service", FixedIn: "1.25.4", Description: "A vulnerability in the HTTP/3 implementation could allow an attacker to cause a denial of service."},
		{ID: "CVE-2024-24990", Severity: "Medium", Score: 5.3, Summary: "Memory corruption in HTTP/3", FixedIn: "1.25.4", Description: "Internal memory corruption when handling certain HTTP/3 requests."},
	},
	"1.24.0": {
		{ID: "CVE-2023-44487", Severity: "High", Score: 7.5, Summary: "HTTP/2 Rapid Reset Attack", FixedIn: "1.25.3", Description: "The HTTP/2 protocol allows a denial of service (server resource consumption) via a stream reset attack."},
	},
	"1.22.1": {
		{ID: "CVE-2022-41741", Severity: "High", Score: 7.0, Summary: "Memory corruption in module ngx_http_mp4_module", FixedIn: "1.23.2", Description: "A memory corruption vulnerability in the MP4 module."},
	},
}

// GET /api/cve/nginx/{version}
func (srv *server) handleGetNginxCVEs(w http.ResponseWriter, r *http.Request) {
	version := r.PathValue("version")
	if version == "" {
		http.Error(w, `{"error":"version is required"}`, http.StatusBadRequest)
		return
	}

	// Clean version string (remove 'nginx/' prefix or 'v' prefix)
	cleanVersion := strings.TrimPrefix(version, "nginx/")
	cleanVersion = strings.TrimPrefix(cleanVersion, "v")

	// Exact match or prefix match
	var foundCVEs []CVE
	for v, cves := range nginxCVEs {
		if strings.HasPrefix(cleanVersion, v) {
			foundCVEs = append(foundCVEs, cves...)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"version": cleanVersion,
		"cves":    foundCVEs,
		"count":   len(foundCVEs),
	}); err != nil {
		http.Error(w, `{"error":"failed to encode CVE response"}`, http.StatusInternalServerError)
	}
}
