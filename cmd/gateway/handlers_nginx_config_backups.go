package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// GET /api/agents/{id}/nginx/backups
func (srv *server) handleListNginxConfigBackups(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("id")
	if agentID == "" {
		http.Error(w, `{"error":"agent id required"}`, http.StatusBadRequest)
		return
	}

	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if !srv.canUserAccessAgent(user.Username, agentID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if srv.db == nil {
		http.Error(w, `{"error":"database not configured"}`, http.StatusInternalServerError)
		return
	}

	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	backups, err := srv.db.ListConfigBackups(ctx, agentID, limit)
	if err != nil {
		log.Printf("Failed to list config backups for %s: %v", agentID, err)
		http.Error(w, `{"error":"failed to fetch backups from database"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"backups": backups,
	})
}

// POST /api/agents/{id}/nginx/restore
func (srv *server) handleRestoreNginxConfigBackup(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("id")
	if agentID == "" {
		http.Error(w, `{"error":"agent id required"}`, http.StatusBadRequest)
		return
	}

	user := middleware.GetUserFromContext(r.Context())
	if user == nil || !srv.canUserAccessAgent(user.Username, agentID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var reqBody struct {
		BackupID   int    `json:"backup_id"`
		ConfigPath string `json:"config_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error":"invalid request body format"}`, http.StatusBadRequest)
		return
	}

	if reqBody.BackupID <= 0 {
		http.Error(w, `{"error":"invalid backup_id"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(reqBody.ConfigPath) == "" {
		reqBody.ConfigPath = "/etc/nginx/nginx.conf"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if srv.db == nil {
		http.Error(w, `{"error":"database not configured"}`, http.StatusInternalServerError)
		return
	}

	// Fetch backup from DB
	backup, err := srv.db.GetConfigBackup(ctx, reqBody.BackupID)
	if err != nil {
		http.Error(w, `{"error":"backup not found"}`, http.StatusNotFound)
		return
	}

	if backup.AgentID != agentID {
		http.Error(w, `{"error":"backup does not belong to this agent"}`, http.StatusForbidden)
		return
	}

	// Call UpdateConfig on Agent with the old content
	client, conn, connErr := srv.getAgentClient(agentID)
	if connErr != nil {
		http.Error(w, fmt.Sprintf(`{"error":"agent offline: %s"}`, escapeJSON(connErr.Error())), http.StatusBadGateway)
		return
	}
	defer conn.Close()

	updateReq := &pb.ConfigUpdate{
		InstanceId: agentID,
		ConfigPath: reqBody.ConfigPath,
		NewContent: backup.ConfigContent,
		Backup:     true, // backup the current before restoring
	}

	updateResp, updateErr := client.UpdateConfig(ctx, updateReq)
	if updateErr != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to apply restore: %s"}`, escapeJSON(updateErr.Error())), http.StatusInternalServerError)
		return
	}

	if srv.db != nil {
		srv.db.CreateAuditLog(user.Username, "restore_nginx_config_backup", "agent", agentID, r.RemoteAddr, r.UserAgent(), map[string]interface{}{
			"backup_id":   reqBody.BackupID,
			"config_path": reqBody.ConfigPath,
			"success":     updateResp.Success,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updateResp)
}
