package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// MaintenanceTemplate represents a maintenance page template
type MaintenanceTemplate struct {
	ID          string            `json:"id"`
	ProjectID   *string           `json:"project_id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	HTMLContent string            `json:"html_content"`
	CSSContent  string            `json:"css_content"`
	Assets      map[string]string `json:"assets"`
	Variables   []TemplateVar     `json:"variables"`
	IsDefault   bool              `json:"is_default"`
	IsBuiltIn   bool              `json:"is_built_in"`
	CreatedBy   *string           `json:"created_by"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// TemplateVar represents a template variable definition
type TemplateVar struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Required    bool     `json:"required"`
	Default     string   `json:"default"`
	Validation  string   `json:"validation"`
	Options     []string `json:"options"`
}

// MaintenanceState represents the current maintenance state
type MaintenanceState struct {
	ID             string            `json:"id"`
	Scope          string            `json:"scope"`
	ScopeID        string            `json:"scope_id"`
	SiteFilter     string            `json:"site_filter"`
	LocationFilter string            `json:"location_filter"`
	TemplateID     *string           `json:"template_id"`
	TemplateVars   map[string]string `json:"template_vars"`
	IsEnabled      bool              `json:"is_enabled"`
	EnabledAt      *time.Time        `json:"enabled_at"`
	EnabledBy      *string           `json:"enabled_by"`
	ScheduleType   string            `json:"schedule_type"`
	ScheduledStart *time.Time        `json:"scheduled_start"`
	ScheduledEnd   *time.Time        `json:"scheduled_end"`
	RecurrenceRule string            `json:"recurrence_rule"`
	Timezone       string            `json:"timezone"`
	BypassIPs      []string          `json:"bypass_ips"`
	BypassHeaders  map[string]string `json:"bypass_headers"`
	Reason         string            `json:"reason"`
}

// ListMaintenanceTemplates returns all maintenance templates
func (s *server) ListMaintenanceTemplates(ctx context.Context, req *pb.ListMaintenanceTemplatesRequest) (*pb.ListMaintenanceTemplatesResponse, error) {
	query := `
		SELECT id, project_id, name, description, html_content, css_content, assets, 
			   variables, is_default, is_built_in, created_by, created_at, updated_at
		FROM maintenance_templates
		WHERE project_id IS NULL OR project_id = $1
		ORDER BY is_built_in DESC, name
	`

	var projectID interface{} = nil
	if req.ProjectId != "" {
		projectID = req.ProjectId
	}

	rows, err := s.db.conn.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query templates: %v", err)
	}
	defer rows.Close()

	var templates []*pb.MaintenanceTemplate
	for rows.Next() {
		template, err := scanMaintenanceTemplate(rows)
		if err != nil {
			continue
		}
		templates = append(templates, maintenanceTemplateToProto(template))
	}

	return &pb.ListMaintenanceTemplatesResponse{Templates: templates}, nil
}

// CreateMaintenanceTemplate creates a new maintenance template
func (s *server) CreateMaintenanceTemplate(ctx context.Context, req *pb.CreateMaintenanceTemplateRequest) (*pb.MaintenanceTemplate, error) {
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if req.HtmlContent == "" {
		return nil, status.Error(codes.InvalidArgument, "html_content is required")
	}

	id := uuid.New().String()
	username := getUsernameFromContext(ctx)

	assetsJSON, _ := json.Marshal(req.Assets)
	variablesJSON, _ := json.Marshal(convertTemplateVarsFromProto(req.Variables))

	var projectID interface{} = nil
	if req.ProjectId != "" {
		projectID = req.ProjectId
	}

	query := `
		INSERT INTO maintenance_templates (id, project_id, name, description, html_content, css_content, assets, variables, is_default, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, project_id, name, description, html_content, css_content, assets, variables, is_default, is_built_in, created_by, created_at, updated_at
	`

	var template MaintenanceTemplate
	var templateProjectID, createdBy sql.NullString
	var assetsData, variablesData []byte

	err := s.db.conn.QueryRowContext(ctx, query,
		id, projectID, req.Name, req.Description, req.HtmlContent, req.CssContent,
		assetsJSON, variablesJSON, req.IsDefault, username,
	).Scan(
		&template.ID, &templateProjectID, &template.Name, &template.Description,
		&template.HTMLContent, &template.CSSContent, &assetsData, &variablesData,
		&template.IsDefault, &template.IsBuiltIn, &createdBy,
		&template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create template: %v", err)
	}

	if templateProjectID.Valid {
		template.ProjectID = &templateProjectID.String
	}
	if createdBy.Valid {
		template.CreatedBy = &createdBy.String
	}
	if err := json.Unmarshal(assetsData, &template.Assets); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(variablesData, &template.Variables); err != nil {
		return nil, err
	}

	return maintenanceTemplateToProto(&template), nil
}

// UpdateMaintenanceTemplate updates an existing template
func (s *server) UpdateMaintenanceTemplate(ctx context.Context, req *pb.UpdateMaintenanceTemplateRequest) (*pb.MaintenanceTemplate, error) {
	if req.TemplateId == "" {
		return nil, status.Error(codes.InvalidArgument, "template_id is required")
	}

	// Check if it's a built-in template
	var isBuiltIn bool
	err := s.db.conn.QueryRowContext(ctx, "SELECT is_built_in FROM maintenance_templates WHERE id = $1", req.TemplateId).Scan(&isBuiltIn)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "template not found")
	}
	if isBuiltIn {
		return nil, status.Error(codes.PermissionDenied, "cannot modify built-in templates")
	}

	// Build update query
	updates := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Name != "" {
		updates = append(updates, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, req.Name)
		argIdx++
	}
	if req.Description != "" {
		updates = append(updates, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, req.Description)
		argIdx++
	}
	if req.HtmlContent != "" {
		updates = append(updates, fmt.Sprintf("html_content = $%d", argIdx))
		args = append(args, req.HtmlContent)
		argIdx++
	}
	if req.CssContent != "" {
		updates = append(updates, fmt.Sprintf("css_content = $%d", argIdx))
		args = append(args, req.CssContent)
		argIdx++
	}
	if len(req.Assets) > 0 {
		assetsJSON, _ := json.Marshal(req.Assets)
		updates = append(updates, fmt.Sprintf("assets = $%d", argIdx))
		args = append(args, assetsJSON)
		argIdx++
	}
	if len(req.Variables) > 0 {
		variablesJSON, _ := json.Marshal(convertTemplateVarsFromProto(req.Variables))
		updates = append(updates, fmt.Sprintf("variables = $%d", argIdx))
		args = append(args, variablesJSON)
		argIdx++
	}

	updates = append(updates, fmt.Sprintf("is_default = $%d", argIdx))
	args = append(args, req.IsDefault)
	argIdx++

	if len(updates) == 0 {
		return nil, status.Error(codes.InvalidArgument, "no fields to update")
	}

	args = append(args, req.TemplateId)
	query := fmt.Sprintf(`
		UPDATE maintenance_templates
		SET %s, updated_at = NOW()
		WHERE id = $%d
		RETURNING id, project_id, name, description, html_content, css_content, assets, variables, is_default, is_built_in, created_by, created_at, updated_at
	`, strings.Join(updates, ", "), argIdx)

	var template MaintenanceTemplate
	var templateProjectID, createdBy sql.NullString
	var assetsData, variablesData []byte

	err = s.db.conn.QueryRowContext(ctx, query, args...).Scan(
		&template.ID, &templateProjectID, &template.Name, &template.Description,
		&template.HTMLContent, &template.CSSContent, &assetsData, &variablesData,
		&template.IsDefault, &template.IsBuiltIn, &createdBy,
		&template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update template: %v", err)
	}

	if templateProjectID.Valid {
		template.ProjectID = &templateProjectID.String
	}
	if createdBy.Valid {
		template.CreatedBy = &createdBy.String
	}
	_ = json.Unmarshal(assetsData, &template.Assets)
	_ = json.Unmarshal(variablesData, &template.Variables)

	return maintenanceTemplateToProto(&template), nil
}

// DeleteMaintenanceTemplate deletes a maintenance template
func (s *server) DeleteMaintenanceTemplate(ctx context.Context, req *pb.DeleteMaintenanceTemplateRequest) (*pb.DeleteMaintenanceTemplateResponse, error) {
	if req.TemplateId == "" {
		return nil, status.Error(codes.InvalidArgument, "template_id is required")
	}

	// Check if it's a built-in template
	var isBuiltIn bool
	err := s.db.conn.QueryRowContext(ctx, "SELECT is_built_in FROM maintenance_templates WHERE id = $1", req.TemplateId).Scan(&isBuiltIn)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "template not found")
	}
	if isBuiltIn {
		return nil, status.Error(codes.PermissionDenied, "cannot delete built-in templates")
	}

	_, err = s.db.conn.ExecContext(ctx, "DELETE FROM maintenance_templates WHERE id = $1", req.TemplateId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete template: %v", err)
	}

	return &pb.DeleteMaintenanceTemplateResponse{
		Success: true,
		Message: "Template deleted successfully",
	}, nil
}

// PreviewMaintenanceTemplate renders a template with variables
func (s *server) PreviewMaintenanceTemplate(ctx context.Context, req *pb.PreviewMaintenanceTemplateRequest) (*pb.PreviewMaintenanceTemplateResponse, error) {
	if req.TemplateId == "" {
		return nil, status.Error(codes.InvalidArgument, "template_id is required")
	}

	var htmlContent, cssContent string
	err := s.db.conn.QueryRowContext(ctx,
		"SELECT html_content, css_content FROM maintenance_templates WHERE id = $1",
		req.TemplateId,
	).Scan(&htmlContent, &cssContent)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "template not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get template: %v", err)
	}

	// Simple variable substitution
	rendered := htmlContent
	for key, value := range req.Variables {
		rendered = strings.ReplaceAll(rendered, "{{"+key+"}}", value)
	}

	// Inject CSS if present
	if cssContent != "" {
		rendered = strings.Replace(rendered, "</head>", "<style>"+cssContent+"</style></head>", 1)
	}

	return &pb.PreviewMaintenanceTemplateResponse{
		RenderedHtml: rendered,
	}, nil
}

// SetMaintenance enables or disables maintenance mode
func (s *server) SetMaintenance(ctx context.Context, req *pb.SetMaintenanceRequest) (*pb.SetMaintenanceResponse, error) {
	if req.Scope == "" || req.ScopeId == "" {
		return nil, status.Error(codes.InvalidArgument, "scope and scope_id are required")
	}

	username := getUsernameFromContext(ctx)

	switch req.Action {
	case "enable":
		return s.enableMaintenance(ctx, req, username)
	case "disable":
		return s.disableMaintenance(ctx, req)
	case "schedule":
		return s.scheduleMaintenance(ctx, req, username)
	case "cancel_schedule":
		return s.cancelScheduledMaintenance(ctx, req)
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown action: %s", req.Action)
	}
}

func (s *server) enableMaintenance(ctx context.Context, req *pb.SetMaintenanceRequest, username *string) (*pb.SetMaintenanceResponse, error) {
	id := uuid.New().String()
	now := time.Now()

	templateVarsJSON, _ := json.Marshal(req.TemplateVars)
	bypassHeadersJSON, _ := json.Marshal(req.BypassHeaders)

	var templateID interface{} = nil
	if req.TemplateId != "" {
		templateID = req.TemplateId
	}

	scheduleType := req.ScheduleType
	if scheduleType == "" {
		scheduleType = "immediate"
	}

	timezone := req.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	query := `
		INSERT INTO maintenance_state (id, scope, scope_id, site_filter, location_filter, template_id, template_vars, 
			is_enabled, enabled_at, enabled_by, schedule_type, scheduled_start, scheduled_end, recurrence_rule, 
			timezone, bypass_ips, bypass_headers, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
		ON CONFLICT (scope, scope_id, COALESCE(site_filter, ''), COALESCE(location_filter, ''))
		DO UPDATE SET 
			template_id = EXCLUDED.template_id,
			template_vars = EXCLUDED.template_vars,
			is_enabled = EXCLUDED.is_enabled,
			enabled_at = EXCLUDED.enabled_at,
			enabled_by = EXCLUDED.enabled_by,
			scheduled_end = EXCLUDED.scheduled_end,
			bypass_ips = EXCLUDED.bypass_ips,
			bypass_headers = EXCLUDED.bypass_headers,
			reason = EXCLUDED.reason,
			updated_at = NOW()
		RETURNING id
	`

	var scheduledStart, scheduledEnd *time.Time
	if req.ScheduledStart > 0 {
		t := time.Unix(req.ScheduledStart, 0)
		scheduledStart = &t
	}
	if req.ScheduledEnd > 0 {
		t := time.Unix(req.ScheduledEnd, 0)
		scheduledEnd = &t
	}

	err := s.db.conn.QueryRowContext(ctx, query,
		id, req.Scope, req.ScopeId, nullIfEmpty(req.SiteFilter), nullIfEmpty(req.LocationFilter),
		templateID, templateVarsJSON, true, now, username, scheduleType, scheduledStart, scheduledEnd,
		nullIfEmpty(req.RecurrenceRule), timezone, req.BypassIps, bypassHeadersJSON, nullIfEmpty(req.Reason),
	).Scan(&id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to enable maintenance: %v", err)
	}

	// Apply maintenance to affected agents
	results, err := s.applyMaintenanceToAgents(ctx, req, true)
	if err != nil {
		// Log but don't fail
		fmt.Printf("Warning: failed to apply maintenance to some agents: %v\n", err)
	}

	return &pb.SetMaintenanceResponse{
		Success:            true,
		MaintenanceStateId: id,
		Results:            results,
	}, nil
}

func (s *server) disableMaintenance(ctx context.Context, req *pb.SetMaintenanceRequest) (*pb.SetMaintenanceResponse, error) {
	query := `
		UPDATE maintenance_state
		SET is_enabled = false, updated_at = NOW()
		WHERE scope = $1 AND scope_id = $2 
			AND COALESCE(site_filter, '') = COALESCE($3, '')
			AND COALESCE(location_filter, '') = COALESCE($4, '')
		RETURNING id
	`

	var id string
	err := s.db.conn.QueryRowContext(ctx, query, req.Scope, req.ScopeId, req.SiteFilter, req.LocationFilter).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "maintenance state not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to disable maintenance: %v", err)
	}

	// Remove maintenance from affected agents
	results, err := s.applyMaintenanceToAgents(ctx, req, false)
	if err != nil {
		fmt.Printf("Warning: failed to remove maintenance from some agents: %v\n", err)
	}

	return &pb.SetMaintenanceResponse{
		Success:            true,
		MaintenanceStateId: id,
		Results:            results,
	}, nil
}

func (s *server) scheduleMaintenance(ctx context.Context, req *pb.SetMaintenanceRequest, username *string) (*pb.SetMaintenanceResponse, error) {
	if req.ScheduledStart == 0 {
		return nil, status.Error(codes.InvalidArgument, "scheduled_start is required for scheduling")
	}

	id := uuid.New().String()
	templateVarsJSON, _ := json.Marshal(req.TemplateVars)
	bypassHeadersJSON, _ := json.Marshal(req.BypassHeaders)

	var templateID interface{} = nil
	if req.TemplateId != "" {
		templateID = req.TemplateId
	}

	scheduleType := req.ScheduleType
	if scheduleType == "" {
		scheduleType = "scheduled"
	}

	timezone := req.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	scheduledStart := time.Unix(req.ScheduledStart, 0)
	var scheduledEnd *time.Time
	if req.ScheduledEnd > 0 {
		t := time.Unix(req.ScheduledEnd, 0)
		scheduledEnd = &t
	}

	query := `
		INSERT INTO maintenance_state (id, scope, scope_id, site_filter, location_filter, template_id, template_vars, 
			is_enabled, schedule_type, scheduled_start, scheduled_end, recurrence_rule, 
			timezone, bypass_ips, bypass_headers, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT (scope, scope_id, COALESCE(site_filter, ''), COALESCE(location_filter, ''))
		DO UPDATE SET 
			template_id = EXCLUDED.template_id,
			template_vars = EXCLUDED.template_vars,
			schedule_type = EXCLUDED.schedule_type,
			scheduled_start = EXCLUDED.scheduled_start,
			scheduled_end = EXCLUDED.scheduled_end,
			recurrence_rule = EXCLUDED.recurrence_rule,
			bypass_ips = EXCLUDED.bypass_ips,
			bypass_headers = EXCLUDED.bypass_headers,
			reason = EXCLUDED.reason,
			updated_at = NOW()
		RETURNING id
	`

	err := s.db.conn.QueryRowContext(ctx, query,
		id, req.Scope, req.ScopeId, nullIfEmpty(req.SiteFilter), nullIfEmpty(req.LocationFilter),
		templateID, templateVarsJSON, scheduleType, scheduledStart, scheduledEnd,
		nullIfEmpty(req.RecurrenceRule), timezone, req.BypassIps, bypassHeadersJSON, nullIfEmpty(req.Reason),
	).Scan(&id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to schedule maintenance: %v", err)
	}

	return &pb.SetMaintenanceResponse{
		Success:            true,
		MaintenanceStateId: id,
	}, nil
}

func (s *server) cancelScheduledMaintenance(ctx context.Context, req *pb.SetMaintenanceRequest) (*pb.SetMaintenanceResponse, error) {
	query := `
		DELETE FROM maintenance_state
		WHERE scope = $1 AND scope_id = $2 
			AND COALESCE(site_filter, '') = COALESCE($3, '')
			AND COALESCE(location_filter, '') = COALESCE($4, '')
			AND is_enabled = false
		RETURNING id
	`

	var id string
	err := s.db.conn.QueryRowContext(ctx, query, req.Scope, req.ScopeId, req.SiteFilter, req.LocationFilter).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, status.Error(codes.NotFound, "scheduled maintenance not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to cancel maintenance: %v", err)
	}

	return &pb.SetMaintenanceResponse{
		Success:            true,
		MaintenanceStateId: id,
	}, nil
}

// GetMaintenanceStatus gets the current maintenance status
func (s *server) GetMaintenanceStatus(ctx context.Context, req *pb.GetMaintenanceStatusRequest) (*pb.MaintenanceState, error) {
	query := `
		SELECT id, scope, scope_id, site_filter, location_filter, template_id, template_vars,
			   is_enabled, enabled_at, enabled_by, schedule_type, scheduled_start, scheduled_end,
			   recurrence_rule, timezone, bypass_ips, bypass_headers, reason
		FROM maintenance_state
		WHERE scope = $1 AND scope_id = $2 
			AND COALESCE(site_filter, '') = COALESCE($3, '')
			AND COALESCE(location_filter, '') = COALESCE($4, '')
	`

	state, err := s.scanMaintenanceState(ctx, query, req.Scope, req.ScopeId, req.SiteFilter, req.LocationFilter)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "maintenance state not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to get maintenance status: %v", err)
	}

	return maintenanceStateToProto(state), nil
}

// ListMaintenanceStates lists all maintenance states
func (s *server) ListMaintenanceStates(ctx context.Context, req *pb.ListMaintenanceStatesRequest) (*pb.ListMaintenanceStatesResponse, error) {
	query := `
		SELECT id, scope, scope_id, site_filter, location_filter, template_id, template_vars,
			   is_enabled, enabled_at, enabled_by, schedule_type, scheduled_start, scheduled_end,
			   recurrence_rule, timezone, bypass_ips, bypass_headers, reason
		FROM maintenance_state
		WHERE ($1 = '' OR scope_id = $1 OR scope_id IN (
			SELECT id::text FROM environments WHERE project_id = $1::uuid
		))
		AND ($2 = '' OR scope_id = $2)
		AND ($3 = false OR is_enabled = true)
		ORDER BY is_enabled DESC, enabled_at DESC
	`

	rows, err := s.db.conn.QueryContext(ctx, query, req.ProjectId, req.EnvironmentId, req.EnabledOnly)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list maintenance states: %v", err)
	}
	defer rows.Close()

	var states []*pb.MaintenanceState
	for rows.Next() {
		state, err := s.scanMaintenanceStateFromRows(rows)
		if err != nil {
			continue
		}
		states = append(states, maintenanceStateToProto(state))
	}

	return &pb.ListMaintenanceStatesResponse{States: states}, nil
}

// Helper functions

func (s *server) applyMaintenanceToAgents(ctx context.Context, req *pb.SetMaintenanceRequest, enable bool) ([]*pb.AgentMaintenanceResult, error) {
	// Get affected agents based on scope
	var agentIDs []string

	switch req.Scope {
	case "agent":
		agentIDs = []string{req.ScopeId}
	case "group":
		agents, err := s.getAgentsInGroup(ctx, req.ScopeId)
		if err != nil {
			return nil, err
		}
		for _, a := range agents {
			agentIDs = append(agentIDs, a.agentID)
		}
	case "environment":
		// Get all agents in environment
		rows, err := s.db.conn.QueryContext(ctx,
			"SELECT agent_id FROM server_assignments WHERE environment_id = $1",
			req.ScopeId,
		)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var agentID string
			if err := rows.Scan(&agentID); err != nil {
				continue
			}
			agentIDs = append(agentIDs, agentID)
		}
	}

	// For now, just return success for each agent
	// In a full implementation, this would send commands to agents
	results := make([]*pb.AgentMaintenanceResult, 0, len(agentIDs))
	for _, agentID := range agentIDs {
		result := &pb.AgentMaintenanceResult{
			AgentId: agentID,
		}

		// Get agent session from sync.Map
		if val, ok := s.sessions.Load(agentID); ok {
			if session, ok := val.(*AgentSession); ok {
				result.Hostname = session.hostname
				// In a real implementation, send maintenance config to agent
				// For now, mark as success if agent is online
				if session.status == "online" {
					result.Success = true
				} else {
					result.Success = false
					result.Error = "agent offline"
				}
			}
		} else {
			result.Success = false
			result.Error = "agent not found"
		}

		results = append(results, result)
	}

	return results, nil
}

func (s *server) scanMaintenanceState(ctx context.Context, query string, args ...interface{}) (*MaintenanceState, error) {
	row := s.db.conn.QueryRowContext(ctx, query, args...)
	return s.scanMaintenanceStateFromRow(row)
}

func (s *server) scanMaintenanceStateFromRow(row *sql.Row) (*MaintenanceState, error) {
	var state MaintenanceState
	var templateID, enabledBy, siteFilter, locationFilter, recurrenceRule, reason sql.NullString
	var enabledAt, scheduledStart, scheduledEnd sql.NullTime
	var templateVarsJSON, bypassHeadersJSON []byte
	var bypassIPs []string

	err := row.Scan(
		&state.ID, &state.Scope, &state.ScopeID, &siteFilter, &locationFilter,
		&templateID, &templateVarsJSON, &state.IsEnabled, &enabledAt, &enabledBy,
		&state.ScheduleType, &scheduledStart, &scheduledEnd, &recurrenceRule,
		&state.Timezone, &bypassIPs, &bypassHeadersJSON, &reason,
	)
	if err != nil {
		return nil, err
	}

	if templateID.Valid {
		state.TemplateID = &templateID.String
	}
	if siteFilter.Valid {
		state.SiteFilter = siteFilter.String
	}
	if locationFilter.Valid {
		state.LocationFilter = locationFilter.String
	}
	if enabledAt.Valid {
		state.EnabledAt = &enabledAt.Time
	}
	if enabledBy.Valid {
		state.EnabledBy = &enabledBy.String
	}
	if scheduledStart.Valid {
		state.ScheduledStart = &scheduledStart.Time
	}
	if scheduledEnd.Valid {
		state.ScheduledEnd = &scheduledEnd.Time
	}
	if recurrenceRule.Valid {
		state.RecurrenceRule = recurrenceRule.String
	}
	if reason.Valid {
		state.Reason = reason.String
	}

	state.BypassIPs = bypassIPs
	if err := json.Unmarshal(templateVarsJSON, &state.TemplateVars); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(bypassHeadersJSON, &state.BypassHeaders); err != nil {
		return nil, err
	}

	return &state, nil
}

func (s *server) scanMaintenanceStateFromRows(rows *sql.Rows) (*MaintenanceState, error) {
	var state MaintenanceState
	var templateID, enabledBy, siteFilter, locationFilter, recurrenceRule, reason sql.NullString
	var enabledAt, scheduledStart, scheduledEnd sql.NullTime
	var templateVarsJSON, bypassHeadersJSON []byte
	var bypassIPs []string

	err := rows.Scan(
		&state.ID, &state.Scope, &state.ScopeID, &siteFilter, &locationFilter,
		&templateID, &templateVarsJSON, &state.IsEnabled, &enabledAt, &enabledBy,
		&state.ScheduleType, &scheduledStart, &scheduledEnd, &recurrenceRule,
		&state.Timezone, &bypassIPs, &bypassHeadersJSON, &reason,
	)
	if err != nil {
		return nil, err
	}

	if templateID.Valid {
		state.TemplateID = &templateID.String
	}
	if siteFilter.Valid {
		state.SiteFilter = siteFilter.String
	}
	if locationFilter.Valid {
		state.LocationFilter = locationFilter.String
	}
	if enabledAt.Valid {
		state.EnabledAt = &enabledAt.Time
	}
	if enabledBy.Valid {
		state.EnabledBy = &enabledBy.String
	}
	if scheduledStart.Valid {
		state.ScheduledStart = &scheduledStart.Time
	}
	if scheduledEnd.Valid {
		state.ScheduledEnd = &scheduledEnd.Time
	}
	if recurrenceRule.Valid {
		state.RecurrenceRule = recurrenceRule.String
	}
	if reason.Valid {
		state.Reason = reason.String
	}

	state.BypassIPs = bypassIPs
	if err := json.Unmarshal(templateVarsJSON, &state.TemplateVars); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(bypassHeadersJSON, &state.BypassHeaders); err != nil {
		return nil, err
	}

	return &state, nil
}

func scanMaintenanceTemplate(rows *sql.Rows) (*MaintenanceTemplate, error) {
	var template MaintenanceTemplate
	var projectID, createdBy sql.NullString
	var assetsData, variablesData []byte
	var cssContent sql.NullString

	err := rows.Scan(
		&template.ID, &projectID, &template.Name, &template.Description,
		&template.HTMLContent, &cssContent, &assetsData, &variablesData,
		&template.IsDefault, &template.IsBuiltIn, &createdBy,
		&template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if projectID.Valid {
		template.ProjectID = &projectID.String
	}
	if createdBy.Valid {
		template.CreatedBy = &createdBy.String
	}
	if cssContent.Valid {
		template.CSSContent = cssContent.String
	}
	_ = json.Unmarshal(assetsData, &template.Assets)
	_ = json.Unmarshal(variablesData, &template.Variables)

	return &template, nil
}

func maintenanceTemplateToProto(t *MaintenanceTemplate) *pb.MaintenanceTemplate {
	proto := &pb.MaintenanceTemplate{
		Id:          t.ID,
		Name:        t.Name,
		Description: t.Description,
		HtmlContent: t.HTMLContent,
		CssContent:  t.CSSContent,
		Assets:      t.Assets,
		Variables:   convertTemplateVarsToProto(t.Variables),
		IsDefault:   t.IsDefault,
		IsBuiltIn:   t.IsBuiltIn,
		CreatedAt:   t.CreatedAt.Unix(),
		UpdatedAt:   t.UpdatedAt.Unix(),
	}

	if t.ProjectID != nil {
		proto.ProjectId = *t.ProjectID
	}
	if t.CreatedBy != nil {
		proto.CreatedBy = *t.CreatedBy
	}

	return proto
}

func maintenanceStateToProto(s *MaintenanceState) *pb.MaintenanceState {
	proto := &pb.MaintenanceState{
		Id:             s.ID,
		Scope:          s.Scope,
		ScopeId:        s.ScopeID,
		SiteFilter:     s.SiteFilter,
		LocationFilter: s.LocationFilter,
		TemplateVars:   s.TemplateVars,
		IsEnabled:      s.IsEnabled,
		ScheduleType:   s.ScheduleType,
		RecurrenceRule: s.RecurrenceRule,
		Timezone:       s.Timezone,
		BypassIps:      s.BypassIPs,
		BypassHeaders:  s.BypassHeaders,
		Reason:         s.Reason,
	}

	if s.TemplateID != nil {
		proto.TemplateId = *s.TemplateID
	}
	if s.EnabledAt != nil {
		proto.EnabledAt = s.EnabledAt.Unix()
	}
	if s.EnabledBy != nil {
		proto.EnabledBy = *s.EnabledBy
	}
	if s.ScheduledStart != nil {
		proto.ScheduledStart = s.ScheduledStart.Unix()
	}
	if s.ScheduledEnd != nil {
		proto.ScheduledEnd = s.ScheduledEnd.Unix()
	}

	return proto
}

func convertTemplateVarsToProto(vars []TemplateVar) []*pb.TemplateVariable {
	result := make([]*pb.TemplateVariable, 0, len(vars))
	for _, v := range vars {
		result = append(result, &pb.TemplateVariable{
			Name:         v.Name,
			Description:  v.Description,
			Required:     v.Required,
			DefaultValue: v.Default,
			Validation:   v.Validation,
			Options:      v.Options,
		})
	}
	return result
}

func convertTemplateVarsFromProto(vars []*pb.TemplateVariable) []TemplateVar {
	result := make([]TemplateVar, 0, len(vars))
	for _, v := range vars {
		result = append(result, TemplateVar{
			Name:        v.Name,
			Description: v.Description,
			Required:    v.Required,
			Default:     v.DefaultValue,
			Validation:  v.Validation,
			Options:     v.Options,
		})
	}
	return result
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// handleListMaintenanceTemplates returns all maintenance templates for a project
func (s *server) handleListMaintenanceTemplates(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")

	resp, err := s.ListMaintenanceTemplates(r.Context(), &pb.ListMaintenanceTemplatesRequest{
		ProjectId: projectID,
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Templates)
}

// handleCreateMaintenanceTemplate creates a new maintenance template
func (s *server) handleCreateMaintenanceTemplate(w http.ResponseWriter, r *http.Request) {
	var req pb.CreateMaintenanceTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	resp, err := s.CreateMaintenanceTemplate(r.Context(), &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleSetMaintenance enables or disables maintenance mode
func (s *server) handleSetMaintenance(w http.ResponseWriter, r *http.Request) {
	var req pb.SetMaintenanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	resp, err := s.SetMaintenance(r.Context(), &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleGetMaintenanceStatus returns the current maintenance status for a scope
func (s *server) handleGetMaintenanceStatus(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	scopeID := r.URL.Query().Get("scope_id")
	if scope == "" || scopeID == "" {
		http.Error(w, `{"error":"scope and scope_id required"}`, http.StatusBadRequest)
		return
	}

	state, err := s.GetMaintenanceStatus(r.Context(), &pb.GetMaintenanceStatusRequest{
		Scope:   scope,
		ScopeId: scopeID,
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// handleListMaintenanceStates returns all active maintenance states
func (s *server) handleListMaintenanceStates(w http.ResponseWriter, r *http.Request) {
	resp, err := s.ListMaintenanceStates(r.Context(), &pb.ListMaintenanceStatesRequest{})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.States)
}

// handleUpdateMaintenanceTemplate updates an existing maintenance template
func (s *server) handleUpdateMaintenanceTemplate(w http.ResponseWriter, r *http.Request) {
	var req pb.UpdateMaintenanceTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	resp, err := s.UpdateMaintenanceTemplate(r.Context(), &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// handleDeleteMaintenanceTemplate deletes a maintenance template
func (s *server) handleDeleteMaintenanceTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.URL.Query().Get("id")
	if templateID == "" {
		http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
		return
	}

	resp, err := s.DeleteMaintenanceTemplate(r.Context(), &pb.DeleteMaintenanceTemplateRequest{
		TemplateId: templateID,
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
