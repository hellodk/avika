package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"log"
	"strings"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// DriftReport represents a drift detection report
type DriftReport struct {
	ID              string      `json:"id"`
	ReportType      string      `json:"report_type"`
	TargetID        string      `json:"target_id"`
	CheckType       string      `json:"check_type"`
	BaselineType    string      `json:"baseline_type"`
	BaselineAgentID *string     `json:"baseline_agent_id"`
	BaselineHash    string      `json:"baseline_hash"`
	TotalAgents     int         `json:"total_agents"`
	InSyncCount     int         `json:"in_sync_count"`
	DriftedCount    int         `json:"drifted_count"`
	ErrorCount      int         `json:"error_count"`
	Items           []DriftItem `json:"items"`
	CreatedAt       time.Time   `json:"created_at"`
	ExpiresAt       time.Time   `json:"expires_at"`
}

// DriftItem represents a single agent's drift status
type DriftItem struct {
	AgentID      string `json:"agent_id"`
	Hostname     string `json:"hostname"`
	Status       string `json:"status"` // "in_sync", "drifted", "missing", "error"
	CurrentHash  string `json:"current_hash"`
	Severity     string `json:"severity"` // "critical", "warning", "info"
	DiffSummary  string `json:"diff_summary"`
	DiffContent  string `json:"diff_content"`
	ErrorMessage string `json:"error_message"`
}

// CheckDrift performs a drift check for the specified scope
func (s *server) CheckDrift(ctx context.Context, req *pb.DriftCheckRequest) (*pb.DriftCheckResponse, error) {
	if req.Scope == "" || req.ScopeId == "" {
		return nil, status.Error(codes.InvalidArgument, "scope and scope_id are required")
	}
	if len(req.CheckTypes) == 0 {
		req.CheckTypes = []string{"nginx_main_conf"}
	}

	// For now, we'll implement group-level drift detection
	// This can be extended to environment level
	switch req.Scope {
	case "group":
		return s.checkGroupDrift(ctx, req)
	case "environment":
		return s.checkEnvironmentDrift(ctx, req)
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unsupported scope: %s", req.Scope)
	}
}

// checkGroupDrift performs drift detection within a group
func (s *server) checkGroupDrift(ctx context.Context, req *pb.DriftCheckRequest) (*pb.DriftCheckResponse, error) {
	// Get the group
	group, err := s.getGroupByID(ctx, req.ScopeId)
	if err != nil {
		return nil, err
	}

	// Get all agents in the group
	agents, err := s.getAgentsInGroup(ctx, req.ScopeId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get agents: %v", err)
	}

	if len(agents) == 0 {
		return nil, status.Error(codes.FailedPrecondition, "no agents in group")
	}

	if len(agents) == 1 {
		// Only one agent, nothing to compare
		return &pb.DriftCheckResponse{
			ReportId:     uuid.New().String(),
			Scope:        req.Scope,
			ScopeId:      req.ScopeId,
			CheckType:    req.CheckTypes[0],
			BaselineType: "single_agent",
			TotalAgents:  1,
			InSyncCount:  1,
			Items: []*pb.DriftItem{{
				AgentId:  agents[0].agentID,
				Hostname: agents[0].hostname,
				Status:   "in_sync",
			}},
			CreatedAt: time.Now().Unix(),
		}, nil
	}

	// Process each check type
	checkType := req.CheckTypes[0] // Process first check type for now
	
	// Collect config hashes from all agents
	agentHashes := make(map[string]string) // agent_id -> hash
	agentConfigs := make(map[string]string) // agent_id -> config content (if available)
	var hashCounts = make(map[string]int)   // hash -> count
	
	for _, agent := range agents {
		hash, config, err := s.getAgentConfigHash(ctx, agent.agentID, checkType)
		if err != nil {
			agentHashes[agent.agentID] = ""
			continue
		}
		agentHashes[agent.agentID] = hash
		agentConfigs[agent.agentID] = config
		hashCounts[hash]++
	}

	// Determine baseline
	var baselineHash string
	var baselineAgentID string
	var baselineType string
	var baselineConfig string

	if group.GoldenAgentID != nil && *group.GoldenAgentID != "" {
		// Use golden agent as baseline
		if hash, ok := agentHashes[*group.GoldenAgentID]; ok && hash != "" {
			baselineHash = hash
			baselineAgentID = *group.GoldenAgentID
			baselineType = "golden_agent"
			baselineConfig = agentConfigs[*group.GoldenAgentID]
		}
	}
	
	if baselineHash == "" && req.BaselineAgentId != "" {
		// Use specified agent as baseline
		if hash, ok := agentHashes[req.BaselineAgentId]; ok && hash != "" {
			baselineHash = hash
			baselineAgentID = req.BaselineAgentId
			baselineType = "specified_agent"
			baselineConfig = agentConfigs[req.BaselineAgentId]
		}
	}

	if baselineHash == "" {
		// Use majority vote
		var maxCount int
		for hash, count := range hashCounts {
			if count > maxCount && hash != "" {
				maxCount = count
				baselineHash = hash
			}
		}
		baselineType = "majority"
		
		// Find an agent with the baseline hash for config content
		for agentID, hash := range agentHashes {
			if hash == baselineHash {
				baselineAgentID = agentID
				baselineConfig = agentConfigs[agentID]
				break
			}
		}
	}

	// Compare each agent against baseline
	var items []*pb.DriftItem
	var inSyncCount, driftedCount, errorCount int

	for _, agent := range agents {
		item := &pb.DriftItem{
			AgentId:  agent.agentID,
			Hostname: agent.hostname,
		}

		hash := agentHashes[agent.agentID]
		if hash == "" {
			item.Status = "error"
			item.ErrorMessage = "failed to get config hash"
			item.Severity = "critical"
			errorCount++
		} else if hash == baselineHash {
			item.Status = "in_sync"
			item.CurrentHash = hash
			inSyncCount++
		} else {
			item.Status = "drifted"
			item.CurrentHash = hash
			item.Severity = "warning"
			driftedCount++

			// Generate diff if requested
			if req.IncludeDiffContent && baselineConfig != "" && agentConfigs[agent.agentID] != "" {
				diff := generateUnifiedDiff(baselineConfig, agentConfigs[agent.agentID])
				item.DiffContent = diff
				item.DiffSummary = summarizeDiff(diff)
			}
		}

		items = append(items, item)
	}

	// Sort items: drifted first, then errors, then in_sync
	sort.Slice(items, func(i, j int) bool {
		order := map[string]int{"drifted": 0, "error": 1, "in_sync": 2}
		return order[items[i].Status] < order[items[j].Status]
	})

	// Create report
	reportID := uuid.New().String()
	report := &DriftReport{
		ID:              reportID,
		ReportType:      req.Scope,
		TargetID:        req.ScopeId,
		CheckType:       checkType,
		BaselineType:    baselineType,
		BaselineAgentID: &baselineAgentID,
		BaselineHash:    baselineHash,
		TotalAgents:     len(agents),
		InSyncCount:     inSyncCount,
		DriftedCount:    driftedCount,
		ErrorCount:      errorCount,
		Items:           convertDriftItems(items),
		CreatedAt:       time.Now(),
		ExpiresAt:       time.Now().Add(7 * 24 * time.Hour),
	}

	// Store report
	if err := s.storeDriftReport(ctx, report); err != nil {
		// Log but don't fail - the check succeeded
		fmt.Printf("Warning: failed to store drift report: %v\n", err)
	}

	return &pb.DriftCheckResponse{
		ReportId:        reportID,
		Scope:           req.Scope,
		ScopeId:         req.ScopeId,
		CheckType:       checkType,
		BaselineType:    baselineType,
		BaselineAgentId: baselineAgentID,
		BaselineHash:    baselineHash,
		TotalAgents:     int32(len(agents)),
		InSyncCount:     int32(inSyncCount),
		DriftedCount:    int32(driftedCount),
		ErrorCount:      int32(errorCount),
		Items:           items,
		CreatedAt:       time.Now().Unix(),
	}, nil
}

// checkEnvironmentDrift performs drift detection across all groups in an environment
func (s *server) checkEnvironmentDrift(ctx context.Context, req *pb.DriftCheckRequest) (*pb.DriftCheckResponse, error) {
	// Get all groups in the environment
	groupsResp, err := s.ListGroups(ctx, &pb.ListGroupsRequest{EnvironmentId: req.ScopeId})
	if err != nil {
		return nil, err
	}

	if len(groupsResp.Groups) == 0 {
		return nil, status.Error(codes.FailedPrecondition, "no groups in environment")
	}

	// For environment-level, we check drift within each group
	// and report overall status
	var allItems []*pb.DriftItem
	var totalAgents, inSyncCount, driftedCount, errorCount int

	for _, group := range groupsResp.Groups {
		groupReq := &pb.DriftCheckRequest{
			Scope:              "group",
			ScopeId:            group.Id,
			CheckTypes:         req.CheckTypes,
			BaselineAgentId:    req.BaselineAgentId,
			IncludeDiffContent: req.IncludeDiffContent,
		}

		groupResp, err := s.checkGroupDrift(ctx, groupReq)
		if err != nil {
			continue
		}

		totalAgents += int(groupResp.TotalAgents)
		inSyncCount += int(groupResp.InSyncCount)
		driftedCount += int(groupResp.DriftedCount)
		errorCount += int(groupResp.ErrorCount)
		allItems = append(allItems, groupResp.Items...)
	}

	reportID := uuid.New().String()
	return &pb.DriftCheckResponse{
		ReportId:     reportID,
		Scope:        req.Scope,
		ScopeId:      req.ScopeId,
		CheckType:    req.CheckTypes[0],
		BaselineType: "per_group",
		TotalAgents:  int32(totalAgents),
		InSyncCount:  int32(inSyncCount),
		DriftedCount: int32(driftedCount),
		ErrorCount:   int32(errorCount),
		Items:        allItems,
		CreatedAt:    time.Now().Unix(),
	}, nil
}

// GetDriftReport retrieves a stored drift report
func (s *server) GetDriftReport(ctx context.Context, req *pb.GetDriftReportRequest) (*pb.DriftCheckResponse, error) {
	if req.ReportId == "" {
		return nil, status.Error(codes.InvalidArgument, "report_id is required")
	}

	query := `
		SELECT id, report_type, target_id, check_type, baseline_type, baseline_agent_id,
			   baseline_hash, total_agents, in_sync_count, drifted_count, error_count,
			   items, created_at
		FROM drift_reports
		WHERE id = $1
	`

	var report DriftReport
	var baselineAgentID sql.NullString
	var itemsJSON []byte

	err := s.db.conn.QueryRowContext(ctx, query, req.ReportId).Scan(
		&report.ID, &report.ReportType, &report.TargetID, &report.CheckType,
		&report.BaselineType, &baselineAgentID, &report.BaselineHash,
		&report.TotalAgents, &report.InSyncCount, &report.DriftedCount, &report.ErrorCount,
		&itemsJSON, &report.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "drift report not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to query report: %v", err)
	}

	if baselineAgentID.Valid {
		report.BaselineAgentID = &baselineAgentID.String
	}
	if err := json.Unmarshal(itemsJSON, &report.Items); err != nil {
		log.Printf("Failed to unmarshal items for report %s: %v", report.ID, err)
	}

	return driftReportToProto(&report), nil
}

// ListDriftReports lists drift reports for a scope
func (s *server) ListDriftReports(ctx context.Context, req *pb.ListDriftReportsRequest) (*pb.ListDriftReportsResponse, error) {
	limit := req.Limit
	if limit == 0 || limit > 100 {
		limit = 20
	}

	query := `
		SELECT id, report_type, target_id, check_type, baseline_type, baseline_agent_id,
			   baseline_hash, total_agents, in_sync_count, drifted_count, error_count,
			   items, created_at
		FROM drift_reports
		WHERE report_type = $1 AND target_id = $2
		ORDER BY created_at DESC
		LIMIT $3
	`

	rows, err := s.db.conn.QueryContext(ctx, query, req.Scope, req.ScopeId, limit)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query reports: %v", err)
	}
	defer rows.Close()

	var reports []*pb.DriftCheckResponse
	for rows.Next() {
		var report DriftReport
		var baselineAgentID sql.NullString
		var itemsJSON []byte

		err := rows.Scan(
			&report.ID, &report.ReportType, &report.TargetID, &report.CheckType,
			&report.BaselineType, &baselineAgentID, &report.BaselineHash,
			&report.TotalAgents, &report.InSyncCount, &report.DriftedCount, &report.ErrorCount,
			&itemsJSON, &report.CreatedAt,
		)
		if err != nil {
			continue
		}

		if baselineAgentID.Valid {
			report.BaselineAgentID = &baselineAgentID.String
		}
		if err := json.Unmarshal(itemsJSON, &report.Items); err != nil {
			log.Printf("Failed to unmarshal items for report %s: %v", report.ID, err)
		}

		reports = append(reports, driftReportToProto(&report))
	}

	return &pb.ListDriftReportsResponse{Reports: reports}, nil
}

// ResolveDrift resolves drift by syncing agents to baseline
func (s *server) ResolveDrift(ctx context.Context, req *pb.ResolveDriftRequest) (*pb.BatchConfigUpdateResponse, error) {
	if req.ReportId == "" {
		return nil, status.Error(codes.InvalidArgument, "report_id is required")
	}

	// Get the drift report
	reportResp, err := s.GetDriftReport(ctx, &pb.GetDriftReportRequest{ReportId: req.ReportId})
	if err != nil {
		return nil, err
	}

	// Determine which agents to resolve
	var agentsToResolve []string
	if len(req.AgentIds) > 0 {
		agentsToResolve = req.AgentIds
	} else {
		// All drifted agents
		for _, item := range reportResp.Items {
			if item.Status == "drifted" {
				agentsToResolve = append(agentsToResolve, item.AgentId)
			}
		}
	}

	if len(agentsToResolve) == 0 {
		return &pb.BatchConfigUpdateResponse{
			BatchId: uuid.New().String(),
			Status:  "completed",
			Results: []*pb.AgentUpdateResult{},
		}, nil
	}

	switch req.Action {
	case "sync_to_baseline":
		// Use the report's baseline agent
		sourceAgentID := reportResp.BaselineAgentId
		if sourceAgentID == "" {
			return nil, status.Error(codes.FailedPrecondition, "no baseline agent available")
		}
		return s.syncAgentsToSource(ctx, agentsToResolve, sourceAgentID)

	case "sync_to_agent":
		if req.SourceAgentId == "" {
			return nil, status.Error(codes.InvalidArgument, "source_agent_id required for sync_to_agent action")
		}
		return s.syncAgentsToSource(ctx, agentsToResolve, req.SourceAgentId)

	case "acknowledge":
		// Create override records for these agents
		return s.acknowledgeDrift(ctx, agentsToResolve, reportResp.CheckType)

	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown action: %s", req.Action)
	}
}

// Helper functions

type agentBasicInfo struct {
	agentID  string
	hostname string
}

func (s *server) getAgentsInGroup(ctx context.Context, groupID string) ([]agentBasicInfo, error) {
	query := `
		SELECT a.agent_id, a.hostname
		FROM agents a
		JOIN server_assignments sa ON sa.agent_id = a.agent_id
		WHERE sa.group_id = $1
	`

	rows, err := s.db.conn.QueryContext(ctx, query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []agentBasicInfo
	for rows.Next() {
		var agent agentBasicInfo
		if err := rows.Scan(&agent.agentID, &agent.hostname); err != nil {
			continue
		}
		agents = append(agents, agent)
	}

	return agents, nil
}

func (s *server) getAgentConfigHash(ctx context.Context, agentID, checkType string) (string, string, error) {
	// First, check if we have a recent snapshot
	query := `
		SELECT content_hash, content
		FROM config_snapshots
		WHERE agent_id = $1 AND snapshot_type = $2
		ORDER BY captured_at DESC
		LIMIT 1
	`

	var hash string
	var content sql.NullString
	err := s.db.conn.QueryRowContext(ctx, query, agentID, checkType).Scan(&hash, &content)
	if err == nil {
		configContent := ""
		if content.Valid {
			configContent = content.String
		}
		return hash, configContent, nil
	}

	// If no snapshot, try to get config from the live agent
	// This requires the agent to be online
	session, exists := s.getAgentSession(agentID)
	if !exists || session.status != "online" {
		return "", "", fmt.Errorf("agent offline or not found")
	}

	// Try to get config from live agent via gRPC
	// For now, return error - full implementation would make gRPC call
	return "", "", fmt.Errorf("live config fetch not implemented")
}

func (s *server) getAgentSession(agentID string) (*AgentSession, bool) {
	resolved, ok := s.resolveAgentID(agentID)
	if !ok {
		return nil, false
	}
	val, ok := s.sessions.Load(resolved)
	if !ok {
		return nil, false
	}
	if session, ok := val.(*AgentSession); ok {
		return session, true
	}
	return nil, false
}

func (s *server) storeDriftReport(ctx context.Context, report *DriftReport) error {
	itemsJSON, err := json.Marshal(report.Items)
	if err != nil {
		itemsJSON = []byte("[]")
	}

	query := `
		INSERT INTO drift_reports (id, report_type, target_id, check_type, baseline_type,
			baseline_agent_id, baseline_hash, total_agents, in_sync_count, drifted_count,
			error_count, items, created_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`

	_, err = s.db.conn.ExecContext(ctx, query,
		report.ID, report.ReportType, report.TargetID, report.CheckType,
		report.BaselineType, report.BaselineAgentID, report.BaselineHash,
		report.TotalAgents, report.InSyncCount, report.DriftedCount, report.ErrorCount,
		itemsJSON, report.CreatedAt, report.ExpiresAt,
	)

	return err
}

func (s *server) syncAgentsToSource(ctx context.Context, agentIDs []string, sourceAgentID string) (*pb.BatchConfigUpdateResponse, error) {
	// This would trigger a batch config update
	// For now, return a placeholder response
	batchID := uuid.New().String()
	
	results := make([]*pb.AgentUpdateResult, 0, len(agentIDs))
	for _, agentID := range agentIDs {
		results = append(results, &pb.AgentUpdateResult{
			AgentId: agentID,
			Status:  "pending",
		})
	}

	return &pb.BatchConfigUpdateResponse{
		BatchId:      batchID,
		Status:       "in_progress",
		TotalAgents:  int32(len(agentIDs)),
		PendingCount: int32(len(agentIDs)),
		Results:      results,
		StartedAt:    time.Now().Unix(),
	}, nil
}

func (s *server) acknowledgeDrift(ctx context.Context, agentIDs []string, checkType string) (*pb.BatchConfigUpdateResponse, error) {
	// Create override records for these agents
	batchID := uuid.New().String()
	
	results := make([]*pb.AgentUpdateResult, 0, len(agentIDs))
	for _, agentID := range agentIDs {
		result := &pb.AgentUpdateResult{
			AgentId: agentID,
		}

		_, err := s.db.conn.ExecContext(ctx, `
			INSERT INTO agent_config_overrides (agent_id, override_type, target_context, content, reason, exclude_from_drift)
			VALUES ($1, 'exclude', $2, '', 'Drift acknowledged', true)
			ON CONFLICT DO NOTHING
		`, agentID, checkType)

		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		} else {
			result.Status = "success"
		}
		results = append(results, result)
	}

	return &pb.BatchConfigUpdateResponse{
		BatchId:        batchID,
		Status:         "completed",
		TotalAgents:    int32(len(agentIDs)),
		CompletedCount: int32(len(results)),
		Results:        results,
		StartedAt:      time.Now().Unix(),
		CompletedAt:    time.Now().Unix(),
	}, nil
}

func convertDriftItems(items []*pb.DriftItem) []DriftItem {
	result := make([]DriftItem, 0, len(items))
	for _, item := range items {
		result = append(result, DriftItem{
			AgentID:      item.AgentId,
			Hostname:     item.Hostname,
			Status:       item.Status,
			CurrentHash:  item.CurrentHash,
			Severity:     item.Severity,
			DiffSummary:  item.DiffSummary,
			DiffContent:  item.DiffContent,
			ErrorMessage: item.ErrorMessage,
		})
	}
	return result
}

func driftReportToProto(r *DriftReport) *pb.DriftCheckResponse {
	items := make([]*pb.DriftItem, 0, len(r.Items))
	for _, item := range r.Items {
		items = append(items, &pb.DriftItem{
			AgentId:      item.AgentID,
			Hostname:     item.Hostname,
			Status:       item.Status,
			CurrentHash:  item.CurrentHash,
			Severity:     item.Severity,
			DiffSummary:  item.DiffSummary,
			DiffContent:  item.DiffContent,
			ErrorMessage: item.ErrorMessage,
		})
	}

	resp := &pb.DriftCheckResponse{
		ReportId:     r.ID,
		Scope:        r.ReportType,
		ScopeId:      r.TargetID,
		CheckType:    r.CheckType,
		BaselineType: r.BaselineType,
		BaselineHash: r.BaselineHash,
		TotalAgents:  int32(r.TotalAgents),
		InSyncCount:  int32(r.InSyncCount),
		DriftedCount: int32(r.DriftedCount),
		ErrorCount:   int32(r.ErrorCount),
		Items:        items,
		CreatedAt:    r.CreatedAt.Unix(),
	}

	if r.BaselineAgentID != nil {
		resp.BaselineAgentId = *r.BaselineAgentID
	}

	return resp
}

func generateUnifiedDiff(baseline, current string) string {
	// Simple line-by-line diff
	// In production, use a proper diff library
	baseLines := strings.Split(baseline, "\n")
	currLines := strings.Split(current, "\n")

	var diff strings.Builder
	diff.WriteString("--- baseline\n")
	diff.WriteString("+++ current\n")

	maxLen := len(baseLines)
	if len(currLines) > maxLen {
		maxLen = len(currLines)
	}

	for i := 0; i < maxLen; i++ {
		var baseLine, currLine string
		if i < len(baseLines) {
			baseLine = baseLines[i]
		}
		if i < len(currLines) {
			currLine = currLines[i]
		}

		if baseLine != currLine {
			if baseLine != "" {
				diff.WriteString(fmt.Sprintf("-%s\n", baseLine))
			}
			if currLine != "" {
				diff.WriteString(fmt.Sprintf("+%s\n", currLine))
			}
		}
	}

	return diff.String()
}

func summarizeDiff(diff string) string {
	lines := strings.Split(diff, "\n")
	var added, removed int
	for _, line := range lines {
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			added++
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			removed++
		}
	}
	return fmt.Sprintf("+%d lines, -%d lines", added, removed)
}


// DriftForAgentGroupItem is the drift status of one agent in one group (for GET /api/servers/:id/drift).
type DriftForAgentGroupItem struct {
	GroupID      string `json:"group_id"`
	GroupName    string `json:"group_name"`
	ReportID     string `json:"report_id"`
	Status       string `json:"status"`
	BaselineType string `json:"baseline_type"`
	DiffSummary  string `json:"diff_summary,omitempty"`
	DiffContent  string `json:"diff_content,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
	CreatedAt    int64  `json:"created_at"`
}

// getDriftForAgent returns drift status for the given agent in each of its groups.
func (s *server) getDriftForAgent(ctx context.Context, agentID string) ([]DriftForAgentGroupItem, error) {
	groups, err := s.getGroupsForAgent(ctx, agentID)
	if err != nil {
		return nil, err
	}
	var result []DriftForAgentGroupItem
	for _, g := range groups {
		item := DriftForAgentGroupItem{GroupID: g.groupID, GroupName: g.groupName}
		// Prefer latest stored report
		listResp, err := s.ListDriftReports(ctx, &pb.ListDriftReportsRequest{
			Scope:   "group",
			ScopeId: g.groupID,
			Limit:   1,
		})
		if err == nil && len(listResp.Reports) > 0 {
			report := listResp.Reports[0]
			item.ReportID = report.ReportId
			item.BaselineType = report.BaselineType
			item.CreatedAt = report.CreatedAt
			for _, it := range report.Items {
				if it.AgentId == agentID {
					item.Status = it.Status
					item.DiffSummary = it.DiffSummary
					item.DiffContent = it.DiffContent
					item.ErrorMessage = it.ErrorMessage
					break
				}
			}
			if item.Status == "" {
				item.Status = "unknown"
			}
		} else {
			// No report or error: run a fresh drift check for this group
			checkResp, err := s.CheckDrift(ctx, &pb.DriftCheckRequest{
				Scope:      "group",
				ScopeId:    g.groupID,
				CheckTypes: []string{"nginx_main_conf"},
			})
			if err != nil {
				item.Status = "error"
				item.ErrorMessage = err.Error()
				result = append(result, item)
				continue
			}
			item.ReportID = checkResp.ReportId
			item.BaselineType = checkResp.BaselineType
			item.CreatedAt = checkResp.CreatedAt
			for _, it := range checkResp.Items {
				if it.AgentId == agentID {
					item.Status = it.Status
					item.DiffSummary = it.DiffSummary
					item.DiffContent = it.DiffContent
					item.ErrorMessage = it.ErrorMessage
					break
				}
			}
			if item.Status == "" {
				item.Status = "unknown"
			}
		}
		result = append(result, item)
	}
	return result, nil
}

// getProjectIDForGroup returns the project_id for the group's environment.
func (s *server) getProjectIDForGroup(ctx context.Context, groupID string) (string, error) {
	var projectID string
	err := s.db.conn.QueryRowContext(ctx,
		`SELECT e.project_id FROM agent_groups g JOIN environments e ON e.id = g.environment_id WHERE g.id = $1`,
		groupID,
	).Scan(&projectID)
	if err != nil {
		return "", err
	}
	return projectID, nil
}

// CompareGroupsDriftResult is the response for inter-group drift comparison (group A baseline vs group B).
type CompareGroupsDriftResult struct {
	GroupAID     string       `json:"group_a_id"`
	GroupAName   string       `json:"group_a_name"`
	GroupBID     string       `json:"group_b_id"`
	GroupBName   string       `json:"group_b_name"`
	BaselineType string       `json:"baseline_type"`
	BaselineHash string       `json:"baseline_hash,omitempty"`
	Items        []DriftItem  `json:"items"` // B agents vs A baseline
	ComparedAt   int64        `json:"compared_at"`
}

// compareGroupsDrift uses group A as baseline and compares each agent in group B to it (same project).
func (s *server) compareGroupsDrift(ctx context.Context, groupAID, groupBID, projectID string) (*CompareGroupsDriftResult, error) {
	groupA, err := s.getGroupByID(ctx, groupAID)
	if err != nil {
		return nil, err
	}
	groupB, err := s.getGroupByID(ctx, groupBID)
	if err != nil {
		return nil, err
	}
	projA, err := s.getProjectIDForGroup(ctx, groupAID)
	if err != nil {
		return nil, fmt.Errorf("group A: %w", err)
	}
	projB, err := s.getProjectIDForGroup(ctx, groupBID)
	if err != nil {
		return nil, fmt.Errorf("group B: %w", err)
	}
	if projectID != "" && (projA != projectID || projB != projectID) {
		return nil, fmt.Errorf("groups must belong to the same project")
	}
	if projA != projB {
		return nil, fmt.Errorf("groups must belong to the same project")
	}

	checkType := "nginx_main_conf"
	agentsA, err := s.getAgentsInGroup(ctx, groupAID)
	if err != nil {
		return nil, err
	}
	agentsB, err := s.getAgentsInGroup(ctx, groupBID)
	if err != nil {
		return nil, err
	}

	// Build baseline from group A (same logic as checkGroupDrift)
	agentHashesA := make(map[string]string)
	agentConfigsA := make(map[string]string)
	hashCounts := make(map[string]int)
	for _, agent := range agentsA {
		hash, config, err := s.getAgentConfigHash(ctx, agent.agentID, checkType)
		if err != nil {
			continue
		}
		agentHashesA[agent.agentID] = hash
		agentConfigsA[agent.agentID] = config
		hashCounts[hash]++
	}

	var baselineHash, baselineConfig string
	if groupA.GoldenAgentID != nil && *groupA.GoldenAgentID != "" {
		if h, ok := agentHashesA[*groupA.GoldenAgentID]; ok && h != "" {
			baselineHash = h
			baselineConfig = agentConfigsA[*groupA.GoldenAgentID]
		}
	}
	if baselineHash == "" {
		var maxCount int
		for hash, count := range hashCounts {
			if count > maxCount && hash != "" {
				maxCount = count
				baselineHash = hash
			}
		}
		for aid, h := range agentHashesA {
			if h == baselineHash {
				baselineConfig = agentConfigsA[aid]
				break
			}
		}
	}

	baselineType := "majority"
	if groupA.GoldenAgentID != nil && *groupA.GoldenAgentID != "" && agentHashesA[*groupA.GoldenAgentID] == baselineHash {
		baselineType = "golden_agent"
	}

	// Compare each B agent to baseline
	var items []DriftItem
	for _, agent := range agentsB {
		hash, config, err := s.getAgentConfigHash(ctx, agent.agentID, checkType)
		item := DriftItem{AgentID: agent.agentID, Hostname: agent.hostname}
		if err != nil {
			item.Status = "error"
			item.ErrorMessage = err.Error()
			item.Severity = "critical"
			items = append(items, item)
			continue
		}
		if hash == baselineHash {
			item.Status = "in_sync"
			item.CurrentHash = hash
			items = append(items, item)
			continue
		}
		item.Status = "drifted"
		item.CurrentHash = hash
		item.Severity = "warning"
		if baselineConfig != "" && config != "" {
			item.DiffContent = generateUnifiedDiff(baselineConfig, config)
			item.DiffSummary = summarizeDiff(item.DiffContent)
		}
		items = append(items, item)
	}

	return &CompareGroupsDriftResult{
		GroupAID:     groupAID,
		GroupAName:   groupA.Name,
		GroupBID:     groupBID,
		GroupBName:   groupB.Name,
		BaselineType: baselineType,
		BaselineHash: baselineHash,
		Items:        items,
		ComparedAt:   time.Now().Unix(),
	}, nil
}

// handleGetServerDrift handles GET /api/servers/{agentId}/drift
func (s *server) handleGetServerDrift(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent ID required"}`, http.StatusBadRequest)
		return
	}
	items, err := s.getDriftForAgent(r.Context(), agentID)
	if err != nil {
		http.Error(w, `{"error":"`+strings.ReplaceAll(err.Error(), `"`, `\"`)+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"groups": items})
}

// handleCompareDrift handles GET /api/projects/{id}/drift/compare?groupA=uuid&groupB=uuid
func (s *server) handleCompareDrift(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}
	groupA := r.URL.Query().Get("groupA")
	groupB := r.URL.Query().Get("groupB")
	if groupA == "" || groupB == "" {
		http.Error(w, `{"error":"groupA and groupB query params required"}`, http.StatusBadRequest)
		return
	}
	result, err := s.compareGroupsDrift(r.Context(), groupA, groupB, projectID)
	if err != nil {
		http.Error(w, `{"error":"`+strings.ReplaceAll(err.Error(), `"`, `\"`)+`"}`, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
