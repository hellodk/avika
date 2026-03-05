package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// AgentGroup represents a group of agents within an environment
type AgentGroup struct {
	ID                        string            `json:"id"`
	EnvironmentID             string            `json:"environment_id"`
	Name                      string            `json:"name"`
	Slug                      string            `json:"slug"`
	Description               string            `json:"description"`
	GoldenAgentID             *string           `json:"golden_agent_id"`
	ExpectedConfigHash        *string           `json:"expected_config_hash"`
	DriftCheckEnabled         bool              `json:"drift_check_enabled"`
	DriftCheckIntervalSeconds int               `json:"drift_check_interval_seconds"`
	Metadata                  map[string]string `json:"metadata"`
	CreatedBy                 *string           `json:"created_by"`
	CreatedAt                 time.Time         `json:"created_at"`
	UpdatedAt                 time.Time         `json:"updated_at"`
	AgentCount                int               `json:"agent_count"`
}

// ListGroups returns all groups for an environment
func (s *server) ListGroups(ctx context.Context, req *pb.ListGroupsRequest) (*pb.ListGroupsResponse, error) {
	if req.EnvironmentId == "" {
		return nil, status.Error(codes.InvalidArgument, "environment_id is required")
	}

	query := `
		SELECT 
			g.id, g.environment_id, g.name, g.slug, g.description,
			g.golden_agent_id, g.expected_config_hash,
			g.drift_check_enabled, g.drift_check_interval_seconds,
			g.metadata, g.created_by, g.created_at, g.updated_at,
			COUNT(sa.agent_id) as agent_count
		FROM agent_groups g
		LEFT JOIN server_assignments sa ON sa.group_id = g.id
		WHERE g.environment_id = $1
		GROUP BY g.id
		ORDER BY g.name
	`

	rows, err := s.db.conn.QueryContext(ctx, query, req.EnvironmentId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query groups: %v", err)
	}
	defer rows.Close()

	var groups []*pb.AgentGroup
	for rows.Next() {
		group, err := scanAgentGroup(rows)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to scan group: %v", err)
		}
		groups = append(groups, agentGroupToProto(group))
	}

	return &pb.ListGroupsResponse{Groups: groups}, nil
}

// GetGroup returns a single group by ID
func (s *server) GetGroup(ctx context.Context, req *pb.GetGroupRequest) (*pb.AgentGroup, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}

	group, err := s.getGroupByID(ctx, req.GroupId)
	if err != nil {
		return nil, err
	}

	return agentGroupToProto(group), nil
}

// CreateGroup creates a new agent group
func (s *server) CreateGroup(ctx context.Context, req *pb.CreateGroupRequest) (*pb.AgentGroup, error) {
	if req.EnvironmentId == "" {
		return nil, status.Error(codes.InvalidArgument, "environment_id is required")
	}
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}

	// Generate slug if not provided
	slug := req.Slug
	if slug == "" {
		slug = generateSlug(req.Name)
	}

	// Validate slug format
	if !isValidSlug(slug) {
		return nil, status.Error(codes.InvalidArgument, "invalid slug format: must be lowercase alphanumeric with hyphens")
	}

	// Verify environment exists
	var envExists bool
	err := s.db.conn.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM environments WHERE id = $1)", req.EnvironmentId).Scan(&envExists)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to verify environment: %v", err)
	}
	if !envExists {
		return nil, status.Error(codes.NotFound, "environment not found")
	}

	id := uuid.New().String()
	driftCheckInterval := req.DriftCheckIntervalSeconds
	if driftCheckInterval == 0 {
		driftCheckInterval = 300 // Default 5 minutes
	}

	metadata, err := json.Marshal(req.Metadata)
	if err != nil {
		metadata = []byte("{}")
	}

	// Get username from context (set by auth middleware)
	username := getUsernameFromContext(ctx)

	query := `
		INSERT INTO agent_groups (id, environment_id, name, slug, description, drift_check_enabled, drift_check_interval_seconds, metadata, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, environment_id, name, slug, description, golden_agent_id, expected_config_hash, drift_check_enabled, drift_check_interval_seconds, metadata, created_by, created_at, updated_at
	`

	var group AgentGroup
	var metadataJSON []byte
	var goldenAgentID, expectedConfigHash, createdBy sql.NullString

	err = s.db.conn.QueryRowContext(ctx, query,
		id, req.EnvironmentId, req.Name, slug, req.Description,
		req.DriftCheckEnabled, driftCheckInterval, metadata, username,
	).Scan(
		&group.ID, &group.EnvironmentID, &group.Name, &group.Slug, &group.Description,
		&goldenAgentID, &expectedConfigHash,
		&group.DriftCheckEnabled, &group.DriftCheckIntervalSeconds,
		&metadataJSON, &createdBy, &group.CreatedAt, &group.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "duplicate key") {
			return nil, status.Error(codes.AlreadyExists, "group with this slug already exists in this environment")
		}
		return nil, status.Errorf(codes.Internal, "failed to create group: %v", err)
	}

	if goldenAgentID.Valid {
		group.GoldenAgentID = &goldenAgentID.String
	}
	if expectedConfigHash.Valid {
		group.ExpectedConfigHash = &expectedConfigHash.String
	}
	if createdBy.Valid {
		group.CreatedBy = &createdBy.String
	}
	json.Unmarshal(metadataJSON, &group.Metadata)

	return agentGroupToProto(&group), nil
}

// UpdateGroup updates an existing group
func (s *server) UpdateGroup(ctx context.Context, req *pb.UpdateGroupRequest) (*pb.AgentGroup, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}

	// Build update query dynamically
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
	updates = append(updates, fmt.Sprintf("drift_check_enabled = $%d", argIdx))
	args = append(args, req.DriftCheckEnabled)
	argIdx++

	if req.DriftCheckIntervalSeconds > 0 {
		updates = append(updates, fmt.Sprintf("drift_check_interval_seconds = $%d", argIdx))
		args = append(args, req.DriftCheckIntervalSeconds)
		argIdx++
	}

	if len(req.Metadata) > 0 {
		metadata, _ := json.Marshal(req.Metadata)
		updates = append(updates, fmt.Sprintf("metadata = $%d", argIdx))
		args = append(args, metadata)
		argIdx++
	}

	if len(updates) == 0 {
		return nil, status.Error(codes.InvalidArgument, "no fields to update")
	}

	args = append(args, req.GroupId)
	query := fmt.Sprintf(`
		UPDATE agent_groups 
		SET %s, updated_at = NOW()
		WHERE id = $%d
		RETURNING id, environment_id, name, slug, description, golden_agent_id, expected_config_hash, drift_check_enabled, drift_check_interval_seconds, metadata, created_by, created_at, updated_at
	`, strings.Join(updates, ", "), argIdx)

	var group AgentGroup
	var metadataJSON []byte
	var goldenAgentID, expectedConfigHash, createdBy sql.NullString

	err := s.db.conn.QueryRowContext(ctx, query, args...).Scan(
		&group.ID, &group.EnvironmentID, &group.Name, &group.Slug, &group.Description,
		&goldenAgentID, &expectedConfigHash,
		&group.DriftCheckEnabled, &group.DriftCheckIntervalSeconds,
		&metadataJSON, &createdBy, &group.CreatedAt, &group.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "group not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to update group: %v", err)
	}

	if goldenAgentID.Valid {
		group.GoldenAgentID = &goldenAgentID.String
	}
	if expectedConfigHash.Valid {
		group.ExpectedConfigHash = &expectedConfigHash.String
	}
	if createdBy.Valid {
		group.CreatedBy = &createdBy.String
	}
	json.Unmarshal(metadataJSON, &group.Metadata)

	return agentGroupToProto(&group), nil
}

// DeleteGroup deletes a group (agents become ungrouped)
func (s *server) DeleteGroup(ctx context.Context, req *pb.DeleteGroupRequest) (*pb.DeleteGroupResponse, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}

	// First, unassign all agents from this group
	_, err := s.db.conn.ExecContext(ctx, "UPDATE server_assignments SET group_id = NULL WHERE group_id = $1", req.GroupId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to unassign agents: %v", err)
	}

	// Delete the group
	result, err := s.db.conn.ExecContext(ctx, "DELETE FROM agent_groups WHERE id = $1", req.GroupId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete group: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "group not found")
	}

	return &pb.DeleteGroupResponse{
		Success: true,
		Message: "Group deleted successfully",
	}, nil
}

// AddAgentsToGroup adds one or more agents to a group
func (s *server) AddAgentsToGroup(ctx context.Context, req *pb.AddAgentsToGroupRequest) (*pb.AddAgentsToGroupResponse, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}
	if len(req.AgentIds) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one agent_id is required")
	}

	// Get the group's environment_id
	group, err := s.getGroupByID(ctx, req.GroupId)
	if err != nil {
		return nil, err
	}

	results := make([]*pb.AgentGroupAssignmentResult, 0, len(req.AgentIds))

	for _, agentID := range req.AgentIds {
		result := &pb.AgentGroupAssignmentResult{AgentId: agentID}

		// Check if agent exists and is in the same environment
		var agentEnvID sql.NullString
		err := s.db.conn.QueryRowContext(ctx,
			"SELECT environment_id FROM server_assignments WHERE agent_id = $1",
			agentID,
		).Scan(&agentEnvID)

		if err == sql.ErrNoRows {
			// Agent not in server_assignments, check if agent exists
			var exists bool
			s.db.conn.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM agents WHERE agent_id = $1)", agentID).Scan(&exists)
			if !exists {
				result.Success = false
				result.Error = "agent not found"
				results = append(results, result)
				continue
			}
			// Agent exists but not assigned - this shouldn't happen normally
			result.Success = false
			result.Error = "agent not assigned to any environment"
			results = append(results, result)
			continue
		} else if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("failed to query agent: %v", err)
			results = append(results, result)
			continue
		}

		// Check environment match
		if !agentEnvID.Valid || agentEnvID.String != group.EnvironmentID {
			result.Success = false
			result.Error = "agent is in a different environment"
			results = append(results, result)
			continue
		}

		// Update the agent's group
		_, err = s.db.conn.ExecContext(ctx,
			"UPDATE server_assignments SET group_id = $1, updated_at = NOW() WHERE agent_id = $2",
			req.GroupId, agentID,
		)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("failed to assign agent: %v", err)
		} else {
			result.Success = true
		}
		results = append(results, result)
	}

	allSuccess := true
	for _, r := range results {
		if !r.Success {
			allSuccess = false
			break
		}
	}

	return &pb.AddAgentsToGroupResponse{
		Success: allSuccess,
		Results: results,
	}, nil
}

// RemoveAgentFromGroup removes an agent from a group
func (s *server) RemoveAgentFromGroup(ctx context.Context, req *pb.RemoveAgentFromGroupRequest) (*pb.RemoveAgentFromGroupResponse, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}
	if req.AgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_id is required")
	}

	result, err := s.db.conn.ExecContext(ctx,
		"UPDATE server_assignments SET group_id = NULL, updated_at = NOW() WHERE agent_id = $1 AND group_id = $2",
		req.AgentId, req.GroupId,
	)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to remove agent from group: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return nil, status.Error(codes.NotFound, "agent not found in this group")
	}

	return &pb.RemoveAgentFromGroupResponse{
		Success: true,
		Message: "Agent removed from group",
	}, nil
}

// SetGoldenAgent sets or clears the golden agent for a group
func (s *server) SetGoldenAgent(ctx context.Context, req *pb.SetGoldenAgentRequest) (*pb.SetGoldenAgentResponse, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}

	var err error
	if req.AgentId == "" {
		// Clear golden agent
		_, err = s.db.conn.ExecContext(ctx,
			"UPDATE agent_groups SET golden_agent_id = NULL, updated_at = NOW() WHERE id = $1",
			req.GroupId,
		)
	} else {
		// Verify agent is in this group
		var inGroup bool
		s.db.conn.QueryRowContext(ctx,
			"SELECT EXISTS(SELECT 1 FROM server_assignments WHERE agent_id = $1 AND group_id = $2)",
			req.AgentId, req.GroupId,
		).Scan(&inGroup)

		if !inGroup {
			return nil, status.Error(codes.InvalidArgument, "agent must be in the group to be set as golden agent")
		}

		_, err = s.db.conn.ExecContext(ctx,
			"UPDATE agent_groups SET golden_agent_id = $1, updated_at = NOW() WHERE id = $2",
			req.AgentId, req.GroupId,
		)
	}

	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to set golden agent: %v", err)
	}

	msg := "Golden agent set successfully"
	if req.AgentId == "" {
		msg = "Golden agent cleared"
	}

	return &pb.SetGoldenAgentResponse{
		Success: true,
		Message: msg,
	}, nil
}

// GetGroupAgents returns all agents in a group
func (s *server) GetGroupAgents(ctx context.Context, req *pb.GetGroupAgentsRequest) (*pb.GetGroupAgentsResponse, error) {
	if req.GroupId == "" {
		return nil, status.Error(codes.InvalidArgument, "group_id is required")
	}

	query := `
		SELECT a.agent_id, a.hostname, a.version, a.status, a.instances_count, 
			   a.uptime, a.ip, a.last_seen, a.agent_version, a.is_pod, a.pod_ip,
			   a.psk_authenticated
		FROM agents a
		JOIN server_assignments sa ON sa.agent_id = a.agent_id
		WHERE sa.group_id = $1
		ORDER BY a.hostname
	`

	rows, err := s.db.conn.QueryContext(ctx, query, req.GroupId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to query agents: %v", err)
	}
	defer rows.Close()

	var agents []*pb.AgentInfo
	for rows.Next() {
		var agent pb.AgentInfo
		var lastSeen sql.NullInt64
		var uptime, ip, agentVersion, podIP sql.NullString

		err := rows.Scan(
			&agent.AgentId, &agent.Hostname, &agent.Version, &agent.Status,
			&agent.InstancesCount, &uptime, &ip, &lastSeen, &agentVersion,
			&agent.IsPod, &podIP, &agent.PskAuthenticated,
		)
		if err != nil {
			continue
		}

		if uptime.Valid {
			agent.Uptime = uptime.String
		}
		if ip.Valid {
			agent.Ip = ip.String
		}
		if lastSeen.Valid {
			agent.LastSeen = lastSeen.Int64
		}
		if agentVersion.Valid {
			agent.AgentVersion = agentVersion.String
		}
		if podIP.Valid {
			agent.PodIp = podIP.String
		}

		agents = append(agents, &agent)
	}

	return &pb.GetGroupAgentsResponse{Agents: agents}, nil
}

// Helper functions

func (s *server) getGroupByID(ctx context.Context, groupID string) (*AgentGroup, error) {
	query := `
		SELECT 
			g.id, g.environment_id, g.name, g.slug, g.description,
			g.golden_agent_id, g.expected_config_hash,
			g.drift_check_enabled, g.drift_check_interval_seconds,
			g.metadata, g.created_by, g.created_at, g.updated_at,
			COUNT(sa.agent_id) as agent_count
		FROM agent_groups g
		LEFT JOIN server_assignments sa ON sa.group_id = g.id
		WHERE g.id = $1
		GROUP BY g.id
	`

	row := s.db.conn.QueryRowContext(ctx, query, groupID)
	group, err := scanAgentGroupRow(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, status.Error(codes.NotFound, "group not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to query group: %v", err)
	}

	return group, nil
}

// groupAssignment holds group id and name for an agent
type groupAssignment struct {
	groupID   string
	groupName string
}

// getGroupsForAgent returns all groups the agent is assigned to.
func (s *server) getGroupsForAgent(ctx context.Context, agentID string) ([]groupAssignment, error) {
	query := `
		SELECT g.id, g.name
		FROM agent_groups g
		JOIN server_assignments sa ON sa.group_id = g.id
		WHERE sa.agent_id = $1 AND sa.group_id IS NOT NULL
	`
	rows, err := s.db.conn.QueryContext(ctx, query, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []groupAssignment
	for rows.Next() {
		var a groupAssignment
		if err := rows.Scan(&a.groupID, &a.groupName); err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, nil
}

func scanAgentGroup(rows *sql.Rows) (*AgentGroup, error) {
	var group AgentGroup
	var metadataJSON []byte
	var goldenAgentID, expectedConfigHash, createdBy sql.NullString

	err := rows.Scan(
		&group.ID, &group.EnvironmentID, &group.Name, &group.Slug, &group.Description,
		&goldenAgentID, &expectedConfigHash,
		&group.DriftCheckEnabled, &group.DriftCheckIntervalSeconds,
		&metadataJSON, &createdBy, &group.CreatedAt, &group.UpdatedAt,
		&group.AgentCount,
	)
	if err != nil {
		return nil, err
	}

	if goldenAgentID.Valid {
		group.GoldenAgentID = &goldenAgentID.String
	}
	if expectedConfigHash.Valid {
		group.ExpectedConfigHash = &expectedConfigHash.String
	}
	if createdBy.Valid {
		group.CreatedBy = &createdBy.String
	}
	json.Unmarshal(metadataJSON, &group.Metadata)

	return &group, nil
}

func scanAgentGroupRow(row *sql.Row) (*AgentGroup, error) {
	var group AgentGroup
	var metadataJSON []byte
	var goldenAgentID, expectedConfigHash, createdBy sql.NullString

	err := row.Scan(
		&group.ID, &group.EnvironmentID, &group.Name, &group.Slug, &group.Description,
		&goldenAgentID, &expectedConfigHash,
		&group.DriftCheckEnabled, &group.DriftCheckIntervalSeconds,
		&metadataJSON, &createdBy, &group.CreatedAt, &group.UpdatedAt,
		&group.AgentCount,
	)
	if err != nil {
		return nil, err
	}

	if goldenAgentID.Valid {
		group.GoldenAgentID = &goldenAgentID.String
	}
	if expectedConfigHash.Valid {
		group.ExpectedConfigHash = &expectedConfigHash.String
	}
	if createdBy.Valid {
		group.CreatedBy = &createdBy.String
	}
	json.Unmarshal(metadataJSON, &group.Metadata)

	return &group, nil
}

func agentGroupToProto(g *AgentGroup) *pb.AgentGroup {
	proto := &pb.AgentGroup{
		Id:                        g.ID,
		EnvironmentId:             g.EnvironmentID,
		Name:                      g.Name,
		Slug:                      g.Slug,
		Description:               g.Description,
		DriftCheckEnabled:         g.DriftCheckEnabled,
		DriftCheckIntervalSeconds: int32(g.DriftCheckIntervalSeconds),
		Metadata:                  g.Metadata,
		CreatedAt:                 g.CreatedAt.Unix(),
		UpdatedAt:                 g.UpdatedAt.Unix(),
		AgentCount:                int32(g.AgentCount),
	}

	if g.GoldenAgentID != nil {
		proto.GoldenAgentId = *g.GoldenAgentID
	}
	if g.ExpectedConfigHash != nil {
		proto.ExpectedConfigHash = *g.ExpectedConfigHash
	}
	if g.CreatedBy != nil {
		proto.CreatedBy = *g.CreatedBy
	}

	return proto
}

func generateSlug(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)
	// Replace spaces and underscores with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	// Remove any character that isn't alphanumeric or hyphen
	reg := regexp.MustCompile("[^a-z0-9-]+")
	slug = reg.ReplaceAllString(slug, "")
	// Remove consecutive hyphens
	reg = regexp.MustCompile("-+")
	slug = reg.ReplaceAllString(slug, "-")
	// Trim hyphens from start and end
	slug = strings.Trim(slug, "-")
	return slug
}

func isValidSlug(slug string) bool {
	matched, _ := regexp.MatchString("^[a-z0-9]+(-[a-z0-9]+)*$", slug)
	return matched
}

func getUsernameFromContext(ctx context.Context) *string {
	// This would typically extract the username from the context
	// set by the authentication middleware
	// For now, return nil
	return nil
}
