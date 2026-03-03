package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// handleStageConfig handles POST /api/staging/config
func (srv *server) handleStageConfig(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		TargetID    string `json:"target_id"`
		TargetType  string `json:"target_type"`
		Content     string `json:"content"`
		ConfigPath  string `json:"config_path"`
		Description string `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.TargetID == "" || req.Content == "" {
		http.Error(w, `{"error":"target_id and content are required"}`, http.StatusBadRequest)
		return
	}

	staged := &StagedConfig{
		TargetID:    req.TargetID,
		TargetType:  req.TargetType,
		Content:     req.Content,
		ConfigPath:  req.ConfigPath,
		CreatedBy:   user.Username,
		Description: req.Description,
	}

	if err := srv.db.UpsertStagedConfig(staged); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "stage_config", "config", req.TargetID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"path": req.ConfigPath,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(staged)
}

// handleGetStagedConfig handles GET /api/staging/config
func (srv *server) handleGetStagedConfig(w http.ResponseWriter, r *http.Request) {
	targetID := r.URL.Query().Get("target_id")
	configPath := r.URL.Query().Get("path")

	if targetID == "" || configPath == "" {
		http.Error(w, `{"error":"target_id and path are required"}`, http.StatusBadRequest)
		return
	}

	staged, err := srv.db.GetStagedConfig(targetID, configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	if staged == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"status": "no staged config"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(staged)
}

// handleDiscardStagedConfig handles DELETE /api/staging/config
func (srv *server) handleDiscardStagedConfig(w http.ResponseWriter, r *http.Request) {
	targetID := r.URL.Query().Get("target_id")
	configPath := r.URL.Query().Get("path")

	if targetID == "" || configPath == "" {
		http.Error(w, `{"error":"target_id and path are required"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.DeleteStagedConfig(targetID, configPath); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "discarded"})
}
