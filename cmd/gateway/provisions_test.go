package main

import (
	"strings"
	"testing"
)

func TestGenerateProvisionSnippet(t *testing.T) {
	tests := []struct {
		name     string
		template string
		config   map[string]interface{}
		want     string // partial match
	}{
		{
			name:     "Rate Limiting",
			template: "rate-limiting",
			config: map[string]interface{}{
				"requests_per_minute": 100.0,
				"burst_size":          50.0,
			},
			want: "rate=100r/m",
		},
		{
			name:     "Health Checks",
			template: "health-checks",
			config: map[string]interface{}{
				"upstream_name": "backend_test",
			},
			want: "upstream backend_test", // This will fail currently as it is hardcoded to "upstream backend"
		},
		{
			name:     "Error Pages",
			template: "error-pages",
			config: map[string]interface{}{
				"error_codes": "404 500",
				"page_path":   "/404.html",
			},
			want: "error_page 404 500 /404.html",
		},
		{
			name:     "Location Blocks",
			template: "location-blocks",
			config: map[string]interface{}{
				"path": "/api/v2",
			},
			want: "location /api/v2", // This will fail as it returns "Custom provision"
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := generateProvisionSnippet(tt.template, tt.config)
			if !strings.Contains(got, tt.want) {
				t.Errorf("generateProvisionSnippet() = %v, want substring %v", got, tt.want)
			}
		})
	}
}
