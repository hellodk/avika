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

	"github.com/avika-ai/avika/cmd/gateway/config"
	"github.com/avika-ai/avika/cmd/gateway/middleware"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/emptypb"
)

// --------------------------- gRPC (Frontend -> Gateway) ---------------------------

// GetAgentConfig proxies to the agent's management service.
func (s *server) GetAgentConfig(ctx context.Context, req *pb.GetAgentConfigRequest) (*pb.AgentConfig, error) {
	if req == nil || strings.TrimSpace(req.AgentId) == "" {
		return nil, fmt.Errorf("agent_id is required")
	}

	client, conn, err := s.getAgentConfigClient(req.AgentId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	resp, err := client.GetAgentConfig(ctx, &emptypb.Empty{})
	if err != nil {
		return nil, err
	}

	return agentConfigResponseToAgentConfig(resp), nil
}

// UpdateAgentConfig persists agent config on the agent (and attempts hot reload).
// AgentService expects an AgentConfig input, while the agent exposes AgentConfigService.UpdateAgentConfig
// that accepts key/value updates. We translate best-effort.
func (s *server) UpdateAgentConfig(ctx context.Context, cfg *pb.AgentConfig) (*pb.AgentConfigUpdateResult, error) {
	if cfg == nil || strings.TrimSpace(cfg.AgentId) == "" {
		return nil, fmt.Errorf("agent_id is required")
	}

	client, conn, err := s.getAgentConfigClient(cfg.AgentId)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	resp, err := client.UpdateAgentConfig(ctx, &pb.AgentConfigUpdate{
		Updates:   agentConfigToUpdates(cfg),
		Persist:   true,
		HotReload: true,
	})
	if err != nil {
		return nil, err
	}

	return &pb.AgentConfigUpdateResult{
		Success:         resp.Success,
		Error:           resp.Error,
		Message:         resp.Message,
		RequiresRestart: resp.RequiresRestart,
	}, nil
}

func (s *server) getAgentConfigClient(agentID string) (pb.AgentConfigServiceClient, *grpc.ClientConn, error) {
	val, ok := s.sessions.Load(agentID)
	if !ok {
		return nil, nil, fmt.Errorf("agent %s not found", agentID)
	}
	session := val.(*AgentSession)

	targetIP := session.ip
	if session.isPod && session.podIP != "" {
		targetIP = session.podIP
	}
	if targetIP == "" {
		return nil, nil, fmt.Errorf("agent %s has no IP", agentID)
	}

	agentPort := s.config.Agent.MgmtPort
	if agentPort == 0 {
		agentPort = config.DefaultAgentPort
	}
	target := fmt.Sprintf("%s:%d", targetIP, agentPort)

	var dialOpts []grpc.DialOption
	if s.config.Security.EnableTLS && s.config.Security.TLSCertFile != "" {
		tlsConfig, err := loadServerTLSConfig(s.config)
		if err != nil {
			log.Printf("Failed to load TLS config for dialing agent: %v. Falling back to insecure.", err)
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
		} else {
			dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
		}
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	conn, err := grpc.Dial(target, dialOpts...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to agent %s: %v", agentID, err)
	}

	return pb.NewAgentConfigServiceClient(conn), conn, nil
}

// --------------------------- HTTP (Browser/Frontend -> Gateway) ---------------------------

type agentConfigUpdateHTTP struct {
	Config    *pb.AgentConfig   `json:"config"`
	Updates   map[string]string `json:"updates"`
	Persist   bool              `json:"persist"`
	HotReload bool              `json:"hot_reload"`
}

// GET /api/agents/{id}/config
func (srv *server) handleGetAgentRuntimeConfig(w http.ResponseWriter, r *http.Request) {
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

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	client, conn, err := srv.getAgentConfigClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusNotFound)
		return
	}
	defer conn.Close()

	cfg, err := client.GetAgentConfig(ctx, &emptypb.Empty{})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadGateway)
		return
	}
	if srv.db != nil {
		_ = srv.db.UpsertAgentConfigCache(ctx, agentID, cfg)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

// PATCH /api/agents/{id}/config
func (srv *server) handleUpdateAgentRuntimeConfig(w http.ResponseWriter, r *http.Request) {
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

	var body agentConfigUpdateHTTP
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if body.Config == nil && len(body.Updates) == 0 {
		http.Error(w, `{"error":"config or updates are required"}`, http.StatusBadRequest)
		return
	}
	if body.Config != nil {
		body.Config.AgentId = agentID
	}

	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	client, conn, err := srv.getAgentConfigClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusNotFound)
		return
	}
	defer conn.Close()

	updates := body.Updates
	if len(updates) == 0 && body.Config != nil {
		updates = agentConfigToUpdates(body.Config)
	}

	resp, err := client.UpdateAgentConfig(ctx, &pb.AgentConfigUpdate{
		Updates:   updates,
		Persist:   body.Persist,
		HotReload: body.HotReload,
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadGateway)
		return
	}
	if srv.db != nil {
		if latest, gErr := client.GetAgentConfig(ctx, &emptypb.Empty{}); gErr == nil {
			_ = srv.db.UpsertAgentConfigCache(ctx, agentID, latest)
		}

		// Log audit event
		srv.db.CreateAuditLog(user.Username, "update_runtime_config", "agent", agentID, r.RemoteAddr, r.UserAgent(), map[string]interface{}{
			"persist":    body.Persist,
			"hot_reload": body.HotReload,
			"updates":    updates,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /api/agents/{id}/config/backups - List agent config backups (last 5)
func (srv *server) handleListAgentConfigBackups(w http.ResponseWriter, r *http.Request) {
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
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	client, conn, err := srv.getAgentConfigClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusNotFound)
		return
	}
	defer conn.Close()
	resp, err := client.ListConfigBackups(ctx, &emptypb.Empty{})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /api/agents/{id}/config/restore - Restore agent config from a backup
func (srv *server) handleRestoreAgentConfigBackup(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		BackupName string `json:"backup_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.BackupName) == "" {
		http.Error(w, `{"error":"backup_name is required"}`, http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	client, conn, err := srv.getAgentConfigClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusNotFound)
		return
	}
	defer conn.Close()
	resp, err := client.RestoreConfigBackup(ctx, &pb.RestoreConfigBackupRequest{BackupName: body.BackupName})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadGateway)
		return
	}
	if srv.db != nil {
		srv.db.CreateAuditLog(user.Username, "restore_agent_config_backup", "agent", agentID, r.RemoteAddr, r.UserAgent(), map[string]interface{}{
			"backup_name": body.BackupName,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /api/agents/{id}/config/test
func (srv *server) handleTestAgentConfigConnection(w http.ResponseWriter, r *http.Request) {
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

	var req pb.ConnectionTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client, conn, err := srv.getAgentConfigClient(agentID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusNotFound)
		return
	}
	defer conn.Close()

	resp, err := client.TestConnection(ctx, &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (srv *server) canUserAccessAgent(username, agentID string) bool {
	// Superadmins can access all agents
	isSuperAdmin, _ := srv.db.IsSuperAdmin(username)
	if isSuperAdmin {
		return true
	}

	visibleAgents, err := srv.db.GetVisibleAgentIDs(username)
	if err != nil {
		log.Printf("RBAC visible agents error for user %s: %v", username, err)
		return false
	}

	for _, a := range visibleAgents {
		if a == agentID {
			return true
		}
	}
	return false
}

func escapeJSON(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

func agentConfigResponseToAgentConfig(resp *pb.GetAgentConfigResponse) *pb.AgentConfig {
	if resp == nil {
		return &pb.AgentConfig{}
	}

	cfg := &pb.AgentConfig{
		AgentId:         resp.AgentId,
		NginxStatusUrl:  resp.NginxStatusUrl,
		AccessLogPath:   resp.AccessLogPath,
		ErrorLogPath:    resp.ErrorLogPath,
		NginxConfigPath: resp.NginxConfigPath,
		LogFormat:       resp.LogFormat,
		HealthPort:      resp.HealthPort,
		MgmtPort:        resp.MgmtPort,
		BufferDir:       resp.BufferDir,
		UpdateServer:    resp.UpdateServer,
		LogLevel:        resp.LogLevel,
	}
	if ga := strings.TrimSpace(resp.GatewayAddress); ga != "" {
		parts := strings.Split(ga, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				cfg.GatewayAddresses = append(cfg.GatewayAddresses, p)
			}
		}
	}
	if resp.UpdateInterval != "" {
		// Accept either duration strings (e.g. "30s") or raw seconds.
		if d, err := time.ParseDuration(resp.UpdateInterval); err == nil {
			cfg.UpdateIntervalSeconds = int64(d.Seconds())
		} else if s, err := strconv.ParseInt(strings.TrimSpace(resp.UpdateInterval), 10, 64); err == nil {
			cfg.UpdateIntervalSeconds = s
		}
	}
	return cfg
}

func agentConfigToUpdates(cfg *pb.AgentConfig) map[string]string {
	if cfg == nil {
		return map[string]string{}
	}

	updates := map[string]string{}

	if strings.TrimSpace(cfg.AgentId) != "" {
		updates["AGENT_ID"] = cfg.AgentId
	}
	if strings.TrimSpace(cfg.NginxStatusUrl) != "" {
		updates["NGINX_STATUS_URL"] = cfg.NginxStatusUrl
	}
	if strings.TrimSpace(cfg.AccessLogPath) != "" {
		updates["ACCESS_LOG_PATH"] = cfg.AccessLogPath
	}
	if strings.TrimSpace(cfg.ErrorLogPath) != "" {
		updates["ERROR_LOG_PATH"] = cfg.ErrorLogPath
	}
	if strings.TrimSpace(cfg.NginxConfigPath) != "" {
		updates["NGINX_CONFIG_PATH"] = cfg.NginxConfigPath
	}
	if strings.TrimSpace(cfg.LogFormat) != "" {
		updates["LOG_FORMAT"] = cfg.LogFormat
	}
	if strings.TrimSpace(cfg.LogLevel) != "" {
		updates["LOG_LEVEL"] = cfg.LogLevel
	}
	if strings.TrimSpace(cfg.BufferDir) != "" {
		updates["BUFFER_DIR"] = cfg.BufferDir
	}
	if strings.TrimSpace(cfg.UpdateServer) != "" {
		updates["UPDATE_SERVER"] = cfg.UpdateServer
	}

	if len(cfg.GatewayAddresses) > 0 {
		updates["GATEWAYS"] = strings.Join(cfg.GatewayAddresses, ",")
	}
	if cfg.HealthPort > 0 {
		updates["HEALTH_PORT"] = strconv.FormatInt(int64(cfg.HealthPort), 10)
	}
	if cfg.MgmtPort > 0 {
		updates["MGMT_PORT"] = strconv.FormatInt(int64(cfg.MgmtPort), 10)
	}
	if cfg.UpdateIntervalSeconds > 0 {
		updates["UPDATE_INTERVAL"] = (time.Duration(cfg.UpdateIntervalSeconds) * time.Second).String()
	}
	return updates
}
