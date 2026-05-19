package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
	"github.com/google/uuid"
)

// handleListWAFPolicies handles GET /api/waf/policies
func (srv *server) handleListWAFPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := srv.db.ListWAFPolicies()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(policies)
}

// handleCreateWAFPolicy handles POST /api/waf/policies
func (srv *server) handleCreateWAFPolicy(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var p WAFPolicy
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	if p.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.UpsertWAFPolicy(&p); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Audit log
	_ = srv.db.CreateAuditLog(user.Username, "create_waf_policy", "waf", p.ID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": p.Name,
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}

// handleGetWAFPolicy handles GET /api/waf/policies/{id}
func (srv *server) handleGetWAFPolicy(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"policy ID required"}`, http.StatusBadRequest)
		return
	}

	policy, err := srv.db.GetWAFPolicy(id)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	if policy == nil {
		http.Error(w, `{"error":"policy not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(policy)
}

// handleUpdateWAFPolicy handles PUT /api/waf/policies/{id}
func (srv *server) handleUpdateWAFPolicy(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"policy ID required"}`, http.StatusBadRequest)
		return
	}

	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var p WAFPolicy
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	p.ID = id

	if err := srv.db.UpsertWAFPolicy(&p); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Audit log
	_ = srv.db.CreateAuditLog(user.Username, "update_waf_policy", "waf", p.ID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": p.Name,
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
}
