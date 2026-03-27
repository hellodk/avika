package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// GET /api/integrations
func (srv *server) handleListIntegrations(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	rows, err := srv.db.ListIntegrations(ctx)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []IntegrationConfigRow{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

// GET /api/integrations/{type}
func (srv *server) handleGetIntegration(w http.ResponseWriter, r *http.Request) {
	t := r.PathValue("type")
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	row, err := srv.db.GetIntegration(ctx, t)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(row)
}

// PUT /api/integrations/{type}
func (srv *server) handlePutIntegration(w http.ResponseWriter, r *http.Request) {
	t := r.PathValue("type")
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// Superadmin only (integrations often contain credentials)
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	var body IntegrationConfigRow
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	body.Type = t
	if body.Config == nil {
		body.Config = map[string]interface{}{}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := srv.db.UpsertIntegration(ctx, &body); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// POST /api/integrations/{type}/test
func (srv *server) handleTestIntegration(w http.ResponseWriter, r *http.Request) {
	t := strings.TrimSpace(strings.ToLower(r.PathValue("type")))
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if srv.db == nil {
		http.Error(w, `{"error":"database not available"}`, http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	row, err := srv.db.GetIntegration(ctx, t)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	ok, details := srv.runIntegrationTest(ctx, t, row)
	_ = srv.db.SetIntegrationTestResult(ctx, t, ok, details)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(details)
}

func (srv *server) runIntegrationTest(ctx context.Context, t string, row *IntegrationConfigRow) (bool, map[string]interface{}) {
	if row == nil {
		return false, map[string]interface{}{"success": false, "error": "integration not found"}
	}

	switch t {
	case "webhook":
		// Expect config.url
		u, _ := row.Config["url"].(string)
		if strings.TrimSpace(u) == "" {
			return false, map[string]interface{}{"success": false, "error": "config.url is required"}
		}
		ok, msg, status, lat := testHTTP(ctx, u)
		return ok, map[string]interface{}{"success": ok, "message": msg, "status": status, "latency_ms": lat, "url": u}

	case "grafana":
		u, _ := row.Config["url"].(string)
		if strings.TrimSpace(u) == "" {
			return false, map[string]interface{}{"success": false, "error": "config.url is required"}
		}
		ok, msg, status, lat := testHTTP(ctx, u)
		return ok, map[string]interface{}{"success": ok, "message": msg, "status": status, "latency_ms": lat, "url": u}

	case "smtp":
		host, _ := row.Config["host"].(string)
		portAny := row.Config["port"]
		port := 25
		if p, ok := portAny.(float64); ok {
			port = int(p)
		}
		if strings.TrimSpace(host) == "" {
			return false, map[string]interface{}{"success": false, "error": "config.host is required"}
		}
		addr := fmt.Sprintf("%s:%d", host, port)
		ok, msg, lat := testTCP(ctx, addr)
		return ok, map[string]interface{}{"success": ok, "message": msg, "latency_ms": lat, "address": addr}

	default:
		return false, map[string]interface{}{"success": false, "error": "unsupported integration type"}
	}
}

func testHTTP(ctx context.Context, url string) (bool, string, string, int64) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	client := &http.Client{Timeout: 8 * time.Second}
	start := time.Now()
	resp, err := client.Do(req)
	lat := time.Since(start).Milliseconds()
	if err != nil {
		return false, err.Error(), "", lat
	}
	defer resp.Body.Close()

	ok := resp.StatusCode >= 200 && resp.StatusCode < 300
	msg := "http ok"
	if !ok {
		msg = "http status: " + resp.Status
	}
	return ok, msg, resp.Status, lat
}

func testTCP(ctx context.Context, addr string) (bool, string, int64) {
	start := time.Now()
	d := net.Dialer{Timeout: 5 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	lat := time.Since(start).Milliseconds()
	if err != nil {
		return false, err.Error(), lat
	}
	_ = conn.Close()
	return true, "tcp connection ok", lat
}
