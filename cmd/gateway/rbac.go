package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Permission levels for team-project access
type Permission string

const (
	PermissionRead    Permission = "read"
	PermissionWrite   Permission = "write"
	PermissionOperate Permission = "operate"
	PermissionAdmin   Permission = "admin"
)

// TeamRole defines the role within a team
type TeamRole string

const (
	TeamRoleAdmin  TeamRole = "admin"
	TeamRoleMember TeamRole = "member"
)

// Project represents a project in the system
type Project struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Description string          `json:"description,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	CreatedBy   string          `json:"created_by,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// Environment represents an environment within a project
type Environment struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"project_id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	Description  string    `json:"description,omitempty"`
	Color        string    `json:"color"`
	SortOrder    int       `json:"sort_order"`
	IsProduction bool      `json:"is_production"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ServerAssignment links an agent to an environment
type ServerAssignment struct {
	AgentID       string          `json:"agent_id"`
	EnvironmentID string          `json:"environment_id,omitempty"`
	DisplayName   string          `json:"display_name,omitempty"`
	Tags          []string        `json:"tags,omitempty"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
	AssignedBy    string          `json:"assigned_by,omitempty"`
	AssignedAt    time.Time       `json:"assigned_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// Team represents a team of users
type Team struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Slug        string          `json:"slug"`
	Description string          `json:"description,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// TeamMember represents a user's membership in a team
type TeamMember struct {
	TeamID   string   `json:"team_id"`
	Username string   `json:"username"`
	Role     TeamRole `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// TeamProjectAccess defines a team's access to a project
type TeamProjectAccess struct {
	TeamID     string     `json:"team_id"`
	ProjectID  string     `json:"project_id"`
	Permission Permission `json:"permission"`
	GrantedBy  string     `json:"granted_by,omitempty"`
	GrantedAt  time.Time  `json:"granted_at"`
}

// UserAccess represents a user's effective access
type UserAccess struct {
	Username       string
	IsSuperAdmin   bool
	Teams          []TeamMember
	ProjectAccess  map[string]Permission // project_id -> permission
}

// AuditLog represents an audit log entry
type AuditLog struct {
	ID           string          `json:"id"`
	Timestamp    time.Time       `json:"timestamp"`
	Username     string          `json:"username,omitempty"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resource_type"`
	ResourceID   string          `json:"resource_id,omitempty"`
	Details      json.RawMessage `json:"details,omitempty"`
	IPAddress    string          `json:"ip_address,omitempty"`
	UserAgent    string          `json:"user_agent,omitempty"`
}

// EnrollmentToken represents an enrollment token for agent registration
type EnrollmentToken struct {
	ID            string     `json:"id"`
	EnvironmentID string     `json:"environment_id"`
	Token         string     `json:"token,omitempty"` // Only populated on creation (plaintext)
	Description   string     `json:"description,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	MaxUses       *int       `json:"max_uses,omitempty"`
	UseCount      int        `json:"use_count"`
	CreatedBy     string     `json:"created_by,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	LastUsedAt    *time.Time `json:"last_used_at,omitempty"`
}

// ============================================================================
// Project Operations
// ============================================================================

// CreateProject creates a new project
func (db *DB) CreateProject(name, slug, description, createdBy string) (*Project, error) {
	id := uuid.New().String()
	query := `
		INSERT INTO projects (id, name, slug, description, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, name, slug, description, created_by, created_at, updated_at
	`
	var p Project
	var desc, creator sql.NullString
	err := db.conn.QueryRow(query, id, name, slug, description, createdBy).Scan(
		&p.ID, &p.Name, &p.Slug, &desc, &creator, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}
	p.Description = desc.String
	p.CreatedBy = creator.String
	return &p, nil
}

// GetProject retrieves a project by ID
func (db *DB) GetProject(id string) (*Project, error) {
	query := `
		SELECT id, name, slug, description, metadata, created_by, created_at, updated_at
		FROM projects WHERE id = $1
	`
	var p Project
	var desc, creator sql.NullString
	var metadata []byte
	err := db.conn.QueryRow(query, id).Scan(
		&p.ID, &p.Name, &p.Slug, &desc, &metadata, &creator, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.Description = desc.String
	p.CreatedBy = creator.String
	p.Metadata = metadata
	return &p, nil
}

// GetProjectBySlug retrieves a project by slug
func (db *DB) GetProjectBySlug(slug string) (*Project, error) {
	query := `
		SELECT id, name, slug, description, metadata, created_by, created_at, updated_at
		FROM projects WHERE slug = $1
	`
	var p Project
	var desc, creator sql.NullString
	var metadata []byte
	err := db.conn.QueryRow(query, slug).Scan(
		&p.ID, &p.Name, &p.Slug, &desc, &metadata, &creator, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.Description = desc.String
	p.CreatedBy = creator.String
	p.Metadata = metadata
	return &p, nil
}

// ListProjects lists all projects (for superadmins) or accessible projects (for users)
func (db *DB) ListProjects() ([]Project, error) {
	query := `
		SELECT id, name, slug, description, created_by, created_at, updated_at
		FROM projects ORDER BY name
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		var desc, creator sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &desc, &creator, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Description = desc.String
		p.CreatedBy = creator.String
		projects = append(projects, p)
	}
	return projects, nil
}

// ListProjectsForUser lists projects accessible by a user
func (db *DB) ListProjectsForUser(username string) ([]Project, error) {
	query := `
		SELECT DISTINCT p.id, p.name, p.slug, p.description, p.created_by, p.created_at, p.updated_at
		FROM projects p
		JOIN team_project_access tpa ON p.id = tpa.project_id
		JOIN team_members tm ON tpa.team_id = tm.team_id
		WHERE tm.username = $1
		ORDER BY p.name
	`
	rows, err := db.conn.Query(query, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		var desc, creator sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &desc, &creator, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Description = desc.String
		p.CreatedBy = creator.String
		projects = append(projects, p)
	}
	return projects, nil
}

// UpdateProject updates a project
func (db *DB) UpdateProject(id, name, description string) error {
	query := `UPDATE projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`
	_, err := db.conn.Exec(query, name, description, id)
	return err
}

// DeleteProject deletes a project
func (db *DB) DeleteProject(id string) error {
	_, err := db.conn.Exec("DELETE FROM projects WHERE id = $1", id)
	return err
}

// ============================================================================
// Environment Operations
// ============================================================================

// CreateEnvironment creates a new environment within a project
func (db *DB) CreateEnvironment(projectID, name, slug, description, color string, sortOrder int, isProduction bool) (*Environment, error) {
	id := uuid.New().String()
	query := `
		INSERT INTO environments (id, project_id, name, slug, description, color, sort_order, is_production, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, project_id, name, slug, description, color, sort_order, is_production, created_at, updated_at
	`
	var e Environment
	var desc sql.NullString
	err := db.conn.QueryRow(query, id, projectID, name, slug, description, color, sortOrder, isProduction).Scan(
		&e.ID, &e.ProjectID, &e.Name, &e.Slug, &desc, &e.Color, &e.SortOrder, &e.IsProduction, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create environment: %w", err)
	}
	e.Description = desc.String
	return &e, nil
}

// GetEnvironment retrieves an environment by ID
func (db *DB) GetEnvironment(id string) (*Environment, error) {
	query := `
		SELECT id, project_id, name, slug, description, color, sort_order, is_production, created_at, updated_at
		FROM environments WHERE id = $1
	`
	var e Environment
	var desc sql.NullString
	err := db.conn.QueryRow(query, id).Scan(
		&e.ID, &e.ProjectID, &e.Name, &e.Slug, &desc, &e.Color, &e.SortOrder, &e.IsProduction, &e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Description = desc.String
	return &e, nil
}

// GetEnvironmentBySlug retrieves an environment by project ID and slug
func (db *DB) GetEnvironmentBySlug(projectID, slug string) (*Environment, error) {
	query := `
		SELECT id, project_id, name, slug, description, color, sort_order, is_production, created_at, updated_at
		FROM environments WHERE project_id = $1 AND slug = $2
	`
	var e Environment
	var desc sql.NullString
	err := db.conn.QueryRow(query, projectID, slug).Scan(
		&e.ID, &e.ProjectID, &e.Name, &e.Slug, &desc, &e.Color, &e.SortOrder, &e.IsProduction, &e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Description = desc.String
	return &e, nil
}

// ListEnvironments lists all environments in a project
func (db *DB) ListEnvironments(projectID string) ([]Environment, error) {
	query := `
		SELECT id, project_id, name, slug, description, color, sort_order, is_production, created_at, updated_at
		FROM environments WHERE project_id = $1 ORDER BY sort_order, name
	`
	rows, err := db.conn.Query(query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envs []Environment
	for rows.Next() {
		var e Environment
		var desc sql.NullString
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.Name, &e.Slug, &desc, &e.Color, &e.SortOrder, &e.IsProduction, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		e.Description = desc.String
		envs = append(envs, e)
	}
	return envs, nil
}

// UpdateEnvironment updates an environment
func (db *DB) UpdateEnvironment(id, name, description, color string, sortOrder int, isProduction bool) error {
	query := `
		UPDATE environments 
		SET name = $1, description = $2, color = $3, sort_order = $4, is_production = $5, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $6
	`
	_, err := db.conn.Exec(query, name, description, color, sortOrder, isProduction, id)
	return err
}

// DeleteEnvironment deletes an environment
func (db *DB) DeleteEnvironment(id string) error {
	_, err := db.conn.Exec("DELETE FROM environments WHERE id = $1", id)
	return err
}

// CreateDefaultEnvironments creates default environments for a new project
func (db *DB) CreateDefaultEnvironments(projectID string) error {
	defaults := []struct {
		name, slug, color string
		sortOrder         int
		isProduction      bool
	}{
		{"Production", "production", "#ef4444", 1, true},
		{"Staging", "staging", "#eab308", 2, false},
		{"Development", "development", "#3b82f6", 3, false},
	}

	for _, d := range defaults {
		_, err := db.CreateEnvironment(projectID, d.name, d.slug, "", d.color, d.sortOrder, d.isProduction)
		if err != nil {
			return err
		}
	}
	return nil
}

// ============================================================================
// Server Assignment Operations
// ============================================================================

// AssignServer assigns a server to an environment
func (db *DB) AssignServer(agentID, environmentID, displayName, assignedBy string, tags []string) (*ServerAssignment, error) {
	var sa ServerAssignment
	var envID, dispName, assignBy sql.NullString
	var tagsArray pq.StringArray

	// Use different query based on whether assignedBy is provided
	if assignedBy == "" {
		// For auto-assignment, don't set assigned_by (leave it NULL)
		query := `
			INSERT INTO server_assignments (agent_id, environment_id, display_name, tags, assigned_at, updated_at)
			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id) DO UPDATE SET
				environment_id = EXCLUDED.environment_id,
				display_name = EXCLUDED.display_name,
				tags = EXCLUDED.tags,
				updated_at = CURRENT_TIMESTAMP
			RETURNING agent_id, environment_id, display_name, tags, assigned_by, assigned_at, updated_at
		`
		err := db.conn.QueryRow(query, agentID, environmentID, displayName, pq.Array(tags)).Scan(
			&sa.AgentID, &envID, &dispName, &tagsArray, &assignBy, &sa.AssignedAt, &sa.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to assign server: %w", err)
		}
	} else {
		// For manual assignment, include assigned_by
		query := `
			INSERT INTO server_assignments (agent_id, environment_id, display_name, tags, assigned_by, assigned_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id) DO UPDATE SET
				environment_id = EXCLUDED.environment_id,
				display_name = EXCLUDED.display_name,
				tags = EXCLUDED.tags,
				assigned_by = EXCLUDED.assigned_by,
				updated_at = CURRENT_TIMESTAMP
			RETURNING agent_id, environment_id, display_name, tags, assigned_by, assigned_at, updated_at
		`
		err := db.conn.QueryRow(query, agentID, environmentID, displayName, pq.Array(tags), assignedBy).Scan(
			&sa.AgentID, &envID, &dispName, &tagsArray, &assignBy, &sa.AssignedAt, &sa.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to assign server: %w", err)
		}
	}

	sa.EnvironmentID = envID.String
	sa.DisplayName = dispName.String
	sa.AssignedBy = assignBy.String
	sa.Tags = tagsArray
	return &sa, nil
}

// UnassignServer removes a server from its environment
func (db *DB) UnassignServer(agentID string) error {
	_, err := db.conn.Exec("UPDATE server_assignments SET environment_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE agent_id = $1", agentID)
	return err
}

// GetServerAssignment gets the assignment for a server
func (db *DB) GetServerAssignment(agentID string) (*ServerAssignment, error) {
	query := `
		SELECT agent_id, environment_id, display_name, tags, assigned_by, assigned_at, updated_at
		FROM server_assignments WHERE agent_id = $1
	`
	var sa ServerAssignment
	var envID, dispName, assignBy sql.NullString
	var tagsArray pq.StringArray
	err := db.conn.QueryRow(query, agentID).Scan(
		&sa.AgentID, &envID, &dispName, &tagsArray, &assignBy, &sa.AssignedAt, &sa.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sa.EnvironmentID = envID.String
	sa.DisplayName = dispName.String
	sa.AssignedBy = assignBy.String
	sa.Tags = tagsArray
	return &sa, nil
}

// ListUnassignedServers lists servers not assigned to any environment
func (db *DB) ListUnassignedServers() ([]string, error) {
	query := `
		SELECT a.agent_id FROM agents a
		LEFT JOIN server_assignments sa ON a.agent_id = sa.agent_id
		WHERE sa.environment_id IS NULL OR sa.agent_id IS NULL
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		agents = append(agents, id)
	}
	return agents, nil
}

// ListServersInEnvironment lists servers in a specific environment
func (db *DB) ListServersInEnvironment(environmentID string) ([]ServerAssignment, error) {
	query := `
		SELECT agent_id, environment_id, display_name, tags, assigned_by, assigned_at, updated_at
		FROM server_assignments WHERE environment_id = $1
	`
	rows, err := db.conn.Query(query, environmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []ServerAssignment
	for rows.Next() {
		var sa ServerAssignment
		var envID, dispName, assignBy sql.NullString
		var tagsArray pq.StringArray
		if err := rows.Scan(&sa.AgentID, &envID, &dispName, &tagsArray, &assignBy, &sa.AssignedAt, &sa.UpdatedAt); err != nil {
			return nil, err
		}
		sa.EnvironmentID = envID.String
		sa.DisplayName = dispName.String
		sa.AssignedBy = assignBy.String
		sa.Tags = tagsArray
		assignments = append(assignments, sa)
	}
	return assignments, nil
}

// ServerAssignmentWithDetails includes environment and project names for display
type ServerAssignmentWithDetails struct {
	AgentID         string    `json:"agent_id"`
	EnvironmentID   string    `json:"environment_id,omitempty"`
	EnvironmentName string    `json:"environment_name,omitempty"`
	ProjectID       string    `json:"project_id,omitempty"`
	ProjectName     string    `json:"project_name,omitempty"`
	DisplayName     string    `json:"display_name,omitempty"`
	Tags            []string  `json:"tags,omitempty"`
	AssignedBy      string    `json:"assigned_by,omitempty"`
	AssignedAt      time.Time `json:"assigned_at"`
}

// ListAllServerAssignments lists all server assignments with environment and project details
func (db *DB) ListAllServerAssignments() ([]ServerAssignmentWithDetails, error) {
	query := `
		SELECT sa.agent_id, sa.environment_id, e.name as env_name, p.id as project_id, p.name as project_name,
			   sa.display_name, sa.tags, sa.assigned_by, sa.assigned_at
		FROM server_assignments sa
		LEFT JOIN environments e ON sa.environment_id = e.id
		LEFT JOIN projects p ON e.project_id = p.id
		ORDER BY p.name, e.name, sa.assigned_at
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []ServerAssignmentWithDetails
	for rows.Next() {
		var sa ServerAssignmentWithDetails
		var envID, envName, projID, projName, dispName, assignBy sql.NullString
		var tagsArray pq.StringArray
		if err := rows.Scan(&sa.AgentID, &envID, &envName, &projID, &projName, &dispName, &tagsArray, &assignBy, &sa.AssignedAt); err != nil {
			return nil, err
		}
		sa.EnvironmentID = envID.String
		sa.EnvironmentName = envName.String
		sa.ProjectID = projID.String
		sa.ProjectName = projName.String
		sa.DisplayName = dispName.String
		sa.AssignedBy = assignBy.String
		sa.Tags = tagsArray
		assignments = append(assignments, sa)
	}
	return assignments, nil
}

// UpdateServerTags updates tags for a server
func (db *DB) UpdateServerTags(agentID string, tags []string) error {
	query := `UPDATE server_assignments SET tags = $1, updated_at = CURRENT_TIMESTAMP WHERE agent_id = $2`
	_, err := db.conn.Exec(query, tags, agentID)
	return err
}

// ============================================================================
// Team Operations
// ============================================================================

// CreateTeam creates a new team
func (db *DB) CreateTeam(name, slug, description string) (*Team, error) {
	id := uuid.New().String()
	query := `
		INSERT INTO teams (id, name, slug, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, name, slug, description, created_at, updated_at
	`
	var t Team
	var desc sql.NullString
	err := db.conn.QueryRow(query, id, name, slug, description).Scan(
		&t.ID, &t.Name, &t.Slug, &desc, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create team: %w", err)
	}
	t.Description = desc.String
	return &t, nil
}

// GetTeam retrieves a team by ID
func (db *DB) GetTeam(id string) (*Team, error) {
	query := `SELECT id, name, slug, description, created_at, updated_at FROM teams WHERE id = $1`
	var t Team
	var desc sql.NullString
	err := db.conn.QueryRow(query, id).Scan(&t.ID, &t.Name, &t.Slug, &desc, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Description = desc.String
	return &t, nil
}

// ListTeams lists all teams
func (db *DB) ListTeams() ([]Team, error) {
	query := `SELECT id, name, slug, description, created_at, updated_at FROM teams ORDER BY name`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		var t Team
		var desc sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &desc, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Description = desc.String
		teams = append(teams, t)
	}
	return teams, nil
}

// ListTeamsForUser lists teams a user belongs to
func (db *DB) ListTeamsForUser(username string) ([]Team, error) {
	query := `
		SELECT t.id, t.name, t.slug, t.description, t.created_at, t.updated_at
		FROM teams t
		JOIN team_members tm ON t.id = tm.team_id
		WHERE tm.username = $1
		ORDER BY t.name
	`
	rows, err := db.conn.Query(query, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		var t Team
		var desc sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &desc, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Description = desc.String
		teams = append(teams, t)
	}
	return teams, nil
}

// UpdateTeam updates a team
func (db *DB) UpdateTeam(id, name, description string) error {
	query := `UPDATE teams SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`
	_, err := db.conn.Exec(query, name, description, id)
	return err
}

// DeleteTeam deletes a team
func (db *DB) DeleteTeam(id string) error {
	_, err := db.conn.Exec("DELETE FROM teams WHERE id = $1", id)
	return err
}

// ============================================================================
// Team Member Operations
// ============================================================================

// AddTeamMember adds a user to a team
func (db *DB) AddTeamMember(teamID, username string, role TeamRole) error {
	query := `
		INSERT INTO team_members (team_id, username, role, joined_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		ON CONFLICT (team_id, username) DO UPDATE SET role = EXCLUDED.role
	`
	_, err := db.conn.Exec(query, teamID, username, role)
	return err
}

// RemoveTeamMember removes a user from a team
func (db *DB) RemoveTeamMember(teamID, username string) error {
	_, err := db.conn.Exec("DELETE FROM team_members WHERE team_id = $1 AND username = $2", teamID, username)
	return err
}

// ListTeamMembers lists members of a team
func (db *DB) ListTeamMembers(teamID string) ([]TeamMember, error) {
	query := `SELECT team_id, username, role, joined_at FROM team_members WHERE team_id = $1 ORDER BY joined_at`
	rows, err := db.conn.Query(query, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []TeamMember
	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.TeamID, &m.Username, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

// GetTeamMember gets a specific team member
func (db *DB) GetTeamMember(teamID, username string) (*TeamMember, error) {
	query := `SELECT team_id, username, role, joined_at FROM team_members WHERE team_id = $1 AND username = $2`
	var m TeamMember
	err := db.conn.QueryRow(query, teamID, username).Scan(&m.TeamID, &m.Username, &m.Role, &m.JoinedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// ============================================================================
// Team Project Access Operations
// ============================================================================

// GrantProjectAccess grants a team access to a project
func (db *DB) GrantProjectAccess(teamID, projectID string, permission Permission, grantedBy string) error {
	query := `
		INSERT INTO team_project_access (team_id, project_id, permission, granted_by, granted_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT (team_id, project_id) DO UPDATE SET permission = EXCLUDED.permission, granted_by = EXCLUDED.granted_by
	`
	_, err := db.conn.Exec(query, teamID, projectID, permission, grantedBy)
	return err
}

// RevokeProjectAccess revokes a team's access to a project
func (db *DB) RevokeProjectAccess(teamID, projectID string) error {
	_, err := db.conn.Exec("DELETE FROM team_project_access WHERE team_id = $1 AND project_id = $2", teamID, projectID)
	return err
}

// ListTeamProjectAccess lists a team's project access
func (db *DB) ListTeamProjectAccess(teamID string) ([]TeamProjectAccess, error) {
	query := `SELECT team_id, project_id, permission, granted_by, granted_at FROM team_project_access WHERE team_id = $1`
	rows, err := db.conn.Query(query, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var access []TeamProjectAccess
	for rows.Next() {
		var a TeamProjectAccess
		var grantedBy sql.NullString
		if err := rows.Scan(&a.TeamID, &a.ProjectID, &a.Permission, &grantedBy, &a.GrantedAt); err != nil {
			return nil, err
		}
		a.GrantedBy = grantedBy.String
		access = append(access, a)
	}
	return access, nil
}

// ============================================================================
// User Access Operations
// ============================================================================

// IsSuperAdmin checks if a user is a superadmin
func (db *DB) IsSuperAdmin(username string) (bool, error) {
	var isSuperAdmin bool
	err := db.conn.QueryRow("SELECT COALESCE(is_superadmin, FALSE) FROM users WHERE username = $1", username).Scan(&isSuperAdmin)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return isSuperAdmin, err
}

// GetUserAccess gets the full access info for a user
func (db *DB) GetUserAccess(username string) (*UserAccess, error) {
	ua := &UserAccess{
		Username:      username,
		ProjectAccess: make(map[string]Permission),
	}

	// Check superadmin status
	isSuperAdmin, err := db.IsSuperAdmin(username)
	if err != nil {
		return nil, err
	}
	ua.IsSuperAdmin = isSuperAdmin

	// Get team memberships
	query := `SELECT team_id, username, role, joined_at FROM team_members WHERE username = $1`
	rows, err := db.conn.Query(query, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.TeamID, &m.Username, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		ua.Teams = append(ua.Teams, m)
	}

	// Get project access through teams
	accessQuery := `
		SELECT DISTINCT tpa.project_id, tpa.permission
		FROM team_project_access tpa
		JOIN team_members tm ON tpa.team_id = tm.team_id
		WHERE tm.username = $1
	`
	accessRows, err := db.conn.Query(accessQuery, username)
	if err != nil {
		return nil, err
	}
	defer accessRows.Close()

	for accessRows.Next() {
		var projectID string
		var permission Permission
		if err := accessRows.Scan(&projectID, &permission); err != nil {
			return nil, err
		}
		// Keep highest permission if multiple teams have access
		existing, ok := ua.ProjectAccess[projectID]
		if !ok || permissionLevel(permission) > permissionLevel(existing) {
			ua.ProjectAccess[projectID] = permission
		}
	}

	return ua, nil
}

// HasProjectAccess checks if a user has at least the required permission on a project
func (db *DB) HasProjectAccess(username, projectID string, requiredPermission Permission) (bool, error) {
	// Superadmins have full access
	isSuperAdmin, err := db.IsSuperAdmin(username)
	if err != nil {
		return false, err
	}
	if isSuperAdmin {
		return true, nil
	}

	// Check team-based access
	query := `
		SELECT tpa.permission FROM team_project_access tpa
		JOIN team_members tm ON tpa.team_id = tm.team_id
		WHERE tm.username = $1 AND tpa.project_id = $2
		ORDER BY 
			CASE tpa.permission 
				WHEN 'admin' THEN 4 
				WHEN 'operate' THEN 3 
				WHEN 'write' THEN 2 
				WHEN 'read' THEN 1 
			END DESC
		LIMIT 1
	`
	var permission Permission
	err = db.conn.QueryRow(query, username, projectID).Scan(&permission)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return permissionLevel(permission) >= permissionLevel(requiredPermission), nil
}

// GetVisibleAgentIDs returns agent IDs visible to a user
func (db *DB) GetVisibleAgentIDs(username string) ([]string, error) {
	// Superadmins see all agents
	isSuperAdmin, err := db.IsSuperAdmin(username)
	if err != nil {
		return nil, err
	}
	if isSuperAdmin {
		rows, err := db.conn.Query("SELECT agent_id FROM agents")
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var agents []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			agents = append(agents, id)
		}
		return agents, nil
	}

	// For regular users, only show agents in their accessible projects
	query := `
		SELECT DISTINCT sa.agent_id
		FROM server_assignments sa
		JOIN environments e ON sa.environment_id = e.id
		JOIN projects p ON e.project_id = p.id
		JOIN team_project_access tpa ON p.id = tpa.project_id
		JOIN team_members tm ON tpa.team_id = tm.team_id
		WHERE tm.username = $1
	`
	rows, err := db.conn.Query(query, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		agents = append(agents, id)
	}
	return agents, nil
}

// permissionLevel returns a numeric level for permission comparison
func permissionLevel(p Permission) int {
	switch p {
	case PermissionAdmin:
		return 4
	case PermissionOperate:
		return 3
	case PermissionWrite:
		return 2
	case PermissionRead:
		return 1
	default:
		return 0
	}
}

// ============================================================================
// Audit Log Operations
// ============================================================================

// CreateAuditLog creates an audit log entry
func (db *DB) CreateAuditLog(username, action, resourceType, resourceID, ipAddress, userAgent string, details interface{}) error {
	var detailsJSON []byte
	var err error
	if details != nil {
		detailsJSON, err = json.Marshal(details)
		if err != nil {
			return err
		}
	}

	query := `
		INSERT INTO audit_logs (username, action, resource_type, resource_id, details, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = db.conn.Exec(query, username, action, resourceType, resourceID, detailsJSON, ipAddress, userAgent)
	return err
}

// ListAuditLogs lists recent audit logs
func (db *DB) ListAuditLogs(limit int) ([]AuditLog, error) {
	query := `
		SELECT id, timestamp, username, action, resource_type, resource_id, details, ip_address, user_agent
		FROM audit_logs ORDER BY timestamp DESC LIMIT $1
	`
	rows, err := db.conn.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []AuditLog
	for rows.Next() {
		var l AuditLog
		var username, resourceID, ipAddress, userAgent sql.NullString
		if err := rows.Scan(&l.ID, &l.Timestamp, &username, &l.Action, &l.ResourceType, &resourceID, &l.Details, &ipAddress, &userAgent); err != nil {
			return nil, err
		}
		l.Username = username.String
		l.ResourceID = resourceID.String
		l.IPAddress = ipAddress.String
		l.UserAgent = userAgent.String
		logs = append(logs, l)
	}
	return logs, nil
}

// ============================================================================
// Enrollment Token Operations
// ============================================================================

// CreateEnrollmentToken creates a new enrollment token for an environment
func (db *DB) CreateEnrollmentToken(environmentID, description, createdBy string, expiresAt *time.Time, maxUses *int) (*EnrollmentToken, string, error) {
	id := uuid.New().String()
	// Generate a random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}
	plainToken := hex.EncodeToString(tokenBytes)
	tokenHash := sha256Hex(plainToken)

	query := `
		INSERT INTO enrollment_tokens (id, environment_id, token_hash, description, expires_at, max_uses, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
		RETURNING id, environment_id, description, expires_at, max_uses, use_count, created_by, created_at, last_used_at
	`
	var et EnrollmentToken
	var desc, creator sql.NullString
	var expires, lastUsed sql.NullTime
	var maxUsesVal sql.NullInt32
	err := db.conn.QueryRow(query, id, environmentID, tokenHash, description, expiresAt, maxUses, createdBy).Scan(
		&et.ID, &et.EnvironmentID, &desc, &expires, &maxUsesVal, &et.UseCount, &creator, &et.CreatedAt, &lastUsed,
	)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create enrollment token: %w", err)
	}
	et.Description = desc.String
	et.CreatedBy = creator.String
	if expires.Valid {
		et.ExpiresAt = &expires.Time
	}
	if maxUsesVal.Valid {
		v := int(maxUsesVal.Int32)
		et.MaxUses = &v
	}
	if lastUsed.Valid {
		et.LastUsedAt = &lastUsed.Time
	}
	return &et, plainToken, nil
}

// sha256Hex returns the hex-encoded SHA256 hash of a string
func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ValidateEnrollmentToken validates a token and returns the environment ID if valid
func (db *DB) ValidateEnrollmentToken(token string) (string, error) {
	tokenHash := sha256Hex(token)
	query := `
		SELECT id, environment_id, expires_at, max_uses, use_count
		FROM enrollment_tokens WHERE token_hash = $1
	`
	var id, envID string
	var expires sql.NullTime
	var maxUses sql.NullInt32
	var useCount int
	err := db.conn.QueryRow(query, tokenHash).Scan(&id, &envID, &expires, &maxUses, &useCount)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("invalid token")
	}
	if err != nil {
		return "", err
	}

	// Check expiration
	if expires.Valid && expires.Time.Before(time.Now()) {
		return "", fmt.Errorf("token has expired")
	}

	// Check max uses
	if maxUses.Valid && useCount >= int(maxUses.Int32) {
		return "", fmt.Errorf("token has reached maximum uses")
	}

	// Increment use count
	_, err = db.conn.Exec("UPDATE enrollment_tokens SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = $1", id)
	if err != nil {
		return "", err
	}

	return envID, nil
}

// ListEnrollmentTokens lists all tokens for an environment
func (db *DB) ListEnrollmentTokens(environmentID string) ([]EnrollmentToken, error) {
	query := `
		SELECT id, environment_id, description, expires_at, max_uses, use_count, created_by, created_at, last_used_at
		FROM enrollment_tokens WHERE environment_id = $1 ORDER BY created_at DESC
	`
	rows, err := db.conn.Query(query, environmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []EnrollmentToken
	for rows.Next() {
		var et EnrollmentToken
		var desc, creator sql.NullString
		var expires, lastUsed sql.NullTime
		var maxUses sql.NullInt32
		if err := rows.Scan(&et.ID, &et.EnvironmentID, &desc, &expires, &maxUses, &et.UseCount, &creator, &et.CreatedAt, &lastUsed); err != nil {
			return nil, err
		}
		et.Description = desc.String
		et.CreatedBy = creator.String
		if expires.Valid {
			et.ExpiresAt = &expires.Time
		}
		if maxUses.Valid {
			v := int(maxUses.Int32)
			et.MaxUses = &v
		}
		if lastUsed.Valid {
			et.LastUsedAt = &lastUsed.Time
		}
		tokens = append(tokens, et)
	}
	return tokens, nil
}

// DeleteEnrollmentToken deletes an enrollment token
func (db *DB) DeleteEnrollmentToken(id string) error {
	_, err := db.conn.Exec("DELETE FROM enrollment_tokens WHERE id = $1", id)
	return err
}
