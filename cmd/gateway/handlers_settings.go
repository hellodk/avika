package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

const settingsKeyIntegrations = "integrations"

// Default integration URLs (k8s FQDN) when not stored in DB
const (
	defaultGrafanaURL     = "http://monitoring-grafana.monitoring.svc.cluster.local"
	defaultPrometheusURL  = "http://monitoring-prometheus.monitoring.svc.cluster.local:9090"
	defaultClickhouseURL  = "http://avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local:8123"
	defaultPostgresDSNMask = "postgres://***@avika-postgresql.avika.svc.cluster.local:5432/avika?sslmode=disable"
)

// integrationsPayload is the JSON shape for GET/POST /api/settings (integrations only for now)
type integrationsPayload struct {
	GrafanaURL     string `json:"grafana_url"`
	PrometheusURL  string `json:"prometheus_url"`
	ClickhouseURL  string `json:"clickhouse_url"`
	PostgresURL    string `json:"postgres_url"` // read-only, from gateway config (masked)
}

// settingsResponse is the full GET response
type settingsResponse struct {
	Integrations integrationsPayload `json:"integrations"`
}

// maskDSN replaces password in a postgres DSN with *** for display
func maskDSN(dsn string) string {
	if dsn == "" {
		return ""
	}
	// postgres://user:password@host:port/db?options -> postgres://***@host:port/db?options
	re := regexp.MustCompile(`^([^:]+://)([^@]+)(@.*)$`)
	if re.MatchString(dsn) {
		return re.ReplaceAllString(dsn, "${1}***${3}")
	}
	return "***"
}

// GET /api/settings
func (srv *server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	integrations := integrationsPayload{
		GrafanaURL:    defaultGrafanaURL,
		PrometheusURL: defaultPrometheusURL,
		ClickhouseURL: defaultClickhouseURL,
		PostgresURL:   defaultPostgresDSNMask,
	}

	// Override from DB if present
	if raw, err := srv.db.GetSetting(settingsKeyIntegrations); err == nil && raw != "" {
		var stored integrationsPayload
		if json.Unmarshal([]byte(raw), &stored) == nil {
			if stored.GrafanaURL != "" {
				integrations.GrafanaURL = stored.GrafanaURL
			}
			if stored.PrometheusURL != "" {
				integrations.PrometheusURL = stored.PrometheusURL
			}
			if stored.ClickhouseURL != "" {
				integrations.ClickhouseURL = stored.ClickhouseURL
			}
			// postgres_url never from DB; always from config (read-only)
		}
	}

	// Postgres URL: read-only from gateway config (masked)
	if srv.config != nil && srv.config.Database.DSN != "" {
		integrations.PostgresURL = maskDSN(srv.config.Database.DSN)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(settingsResponse{Integrations: integrations})
}

// POST /api/settings
func (srv *server) handlePostSettings(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	var body struct {
		Integrations *integrationsPayload `json:"integrations"`
		// Allow other keys later: display, telemetry, etc.
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if body.Integrations == nil {
		http.Error(w, `{"error":"integrations required"}`, http.StatusBadRequest)
		return
	}

	// Persist only grafana, prometheus, clickhouse (trimmed). Postgres is read-only.
	integrations := integrationsPayload{
		GrafanaURL:    strings.TrimSpace(body.Integrations.GrafanaURL),
		PrometheusURL: strings.TrimSpace(body.Integrations.PrometheusURL),
		ClickhouseURL: strings.TrimSpace(body.Integrations.ClickhouseURL),
		PostgresURL:   "", // never persisted
	}

	raw, _ := json.Marshal(integrations)
	if err := srv.db.SetSetting(settingsKeyIntegrations, string(raw)); err != nil {
		http.Error(w, `{"error":"failed to save settings"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}
