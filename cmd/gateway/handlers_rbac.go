package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// slugify converts a name to a URL-friendly slug
func slugify(name string) string {
	slug := strings.ToLower(name)
	slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	return slug
}

// ============================================================================
// Project Handlers
// ============================================================================

// handleListProjects handles GET /api/projects
func (srv *server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var projects []Project
	var err error

	// Superadmins see all projects
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if isSuperAdmin {
		projects, err = srv.db.ListProjects()
	} else {
		projects, err = srv.db.ListProjectsForUser(user.Username)
	}

	if err != nil {
		http.Error(w, `{"error":"failed to list projects"}`, http.StatusInternalServerError)
		return
	}

	if projects == nil {
		projects = []Project{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projects)
}

// handleCreateProject handles POST /api/projects
func (srv *server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can create projects
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	// Generate slug if not provided
	if req.Slug == "" {
		req.Slug = slugify(req.Name)
	}

	project, err := srv.db.CreateProject(req.Name, req.Slug, req.Description, user.Username)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, `{"error":"project with this slug already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create project"}`, http.StatusInternalServerError)
		return
	}

	// Create default environments
	if err := srv.db.CreateDefaultEnvironments(project.ID); err != nil {
		// Log but don't fail - project was created
		// log.Printf("Warning: failed to create default environments for project %s: %v", project.ID, err)
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "create", "project", project.ID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": req.Name,
		"slug": req.Slug,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(project)
}

// handleGetProject handles GET /api/projects/:id
func (srv *server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}

	// Check access
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, projectID, PermissionRead)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	project, err := srv.db.GetProject(projectID)
	if err != nil {
		http.Error(w, `{"error":"failed to get project"}`, http.StatusInternalServerError)
		return
	}
	if project == nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(project)
}

// handleUpdateProject handles PUT /api/projects/:id
func (srv *server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}

	// Check admin access
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, projectID, PermissionAdmin)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.UpdateProject(projectID, req.Name, req.Description); err != nil {
		http.Error(w, `{"error":"failed to update project"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "update", "project", projectID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": req.Name,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// handleDeleteProject handles DELETE /api/projects/:id
func (srv *server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can delete projects
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.DeleteProject(projectID); err != nil {
		http.Error(w, `{"error":"failed to delete project"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "delete", "project", projectID, r.RemoteAddr, r.UserAgent(), nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// ============================================================================
// Environment Handlers
// ============================================================================

// handleListEnvironments handles GET /api/projects/:id/environments
func (srv *server) handleListEnvironments(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}

	// Check access
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, projectID, PermissionRead)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	envs, err := srv.db.ListEnvironments(projectID)
	if err != nil {
		http.Error(w, `{"error":"failed to list environments"}`, http.StatusInternalServerError)
		return
	}

	if envs == nil {
		envs = []Environment{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(envs)
}

// handleCreateEnvironment handles POST /api/projects/:id/environments
func (srv *server) handleCreateEnvironment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	projectID := r.PathValue("id")
	if projectID == "" {
		http.Error(w, `{"error":"project ID required"}`, http.StatusBadRequest)
		return
	}

	// Check admin access
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, projectID, PermissionAdmin)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name         string `json:"name"`
		Slug         string `json:"slug"`
		Description  string `json:"description"`
		Color        string `json:"color"`
		SortOrder    int    `json:"sort_order"`
		IsProduction bool   `json:"is_production"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if req.Slug == "" {
		req.Slug = slugify(req.Name)
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	env, err := srv.db.CreateEnvironment(projectID, req.Name, req.Slug, req.Description, req.Color, req.SortOrder, req.IsProduction)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, `{"error":"environment with this slug already exists in project"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create environment"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "create", "environment", env.ID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name":       req.Name,
		"project_id": projectID,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(env)
}

// handleUpdateEnvironment handles PUT /api/environments/:id
func (srv *server) handleUpdateEnvironment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	envID := r.PathValue("id")
	if envID == "" {
		http.Error(w, `{"error":"environment ID required"}`, http.StatusBadRequest)
		return
	}

	// Get environment to find project
	env, err := srv.db.GetEnvironment(envID)
	if err != nil || env == nil {
		http.Error(w, `{"error":"environment not found"}`, http.StatusNotFound)
		return
	}

	// Check admin access to project
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, env.ProjectID, PermissionAdmin)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Color        string `json:"color"`
		SortOrder    int    `json:"sort_order"`
		IsProduction bool   `json:"is_production"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.UpdateEnvironment(envID, req.Name, req.Description, req.Color, req.SortOrder, req.IsProduction); err != nil {
		http.Error(w, `{"error":"failed to update environment"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "update", "environment", envID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": req.Name,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// handleDeleteEnvironment handles DELETE /api/environments/:id
func (srv *server) handleDeleteEnvironment(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	envID := r.PathValue("id")
	if envID == "" {
		http.Error(w, `{"error":"environment ID required"}`, http.StatusBadRequest)
		return
	}

	// Get environment to find project
	env, err := srv.db.GetEnvironment(envID)
	if err != nil || env == nil {
		http.Error(w, `{"error":"environment not found"}`, http.StatusNotFound)
		return
	}

	// Check admin access to project
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, env.ProjectID, PermissionAdmin)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if err := srv.db.DeleteEnvironment(envID); err != nil {
		http.Error(w, `{"error":"failed to delete environment"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "delete", "environment", envID, r.RemoteAddr, r.UserAgent(), nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// ============================================================================
// Server Assignment Handlers
// ============================================================================

// handleAssignServer handles POST /api/servers/:agentId/assign
func (srv *server) handleAssignServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent ID required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		EnvironmentID string   `json:"environment_id"`
		DisplayName   string   `json:"display_name"`
		Tags          []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.EnvironmentID == "" {
		http.Error(w, `{"error":"environment_id is required"}`, http.StatusBadRequest)
		return
	}

	// Get environment to find project
	env, err := srv.db.GetEnvironment(req.EnvironmentID)
	if err != nil || env == nil {
		http.Error(w, `{"error":"environment not found"}`, http.StatusNotFound)
		return
	}

	// Check admin access to project
	hasAccess, _ := srv.db.HasProjectAccess(user.Username, env.ProjectID, PermissionAdmin)
	if !hasAccess {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	assignment, err := srv.db.AssignServer(agentID, req.EnvironmentID, req.DisplayName, user.Username, req.Tags)
	if err != nil {
		http.Error(w, `{"error":"failed to assign server"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "assign", "server", agentID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"environment_id": req.EnvironmentID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(assignment)
}

// handleUnassignServer handles DELETE /api/servers/:agentId/assign
func (srv *server) handleUnassignServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent ID required"}`, http.StatusBadRequest)
		return
	}

	// Get current assignment to check access
	assignment, err := srv.db.GetServerAssignment(agentID)
	if err != nil {
		http.Error(w, `{"error":"failed to get assignment"}`, http.StatusInternalServerError)
		return
	}

	if assignment != nil && assignment.EnvironmentID != "" {
		env, _ := srv.db.GetEnvironment(assignment.EnvironmentID)
		if env != nil {
			hasAccess, _ := srv.db.HasProjectAccess(user.Username, env.ProjectID, PermissionAdmin)
			if !hasAccess {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
		}
	} else {
		// Only superadmins can unassign servers that aren't assigned
		isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
		if !isSuperAdmin {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	if err := srv.db.UnassignServer(agentID); err != nil {
		http.Error(w, `{"error":"failed to unassign server"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "unassign", "server", agentID, r.RemoteAddr, r.UserAgent(), nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "unassigned"})
}

// handleListUnassignedServers handles GET /api/servers/unassigned
func (srv *server) handleListUnassignedServers(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can see unassigned servers
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	agents, err := srv.db.ListUnassignedServers()
	if err != nil {
		http.Error(w, `{"error":"failed to list unassigned servers"}`, http.StatusInternalServerError)
		return
	}

	if agents == nil {
		agents = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agents)
}

// handleUpdateServerTags handles PUT /api/servers/:agentId/tags
func (srv *server) handleUpdateServerTags(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	agentID := r.PathValue("agentId")
	if agentID == "" {
		http.Error(w, `{"error":"agent ID required"}`, http.StatusBadRequest)
		return
	}

	// Get current assignment to check access
	assignment, err := srv.db.GetServerAssignment(agentID)
	if err != nil || assignment == nil {
		http.Error(w, `{"error":"server assignment not found"}`, http.StatusNotFound)
		return
	}

	if assignment.EnvironmentID != "" {
		env, _ := srv.db.GetEnvironment(assignment.EnvironmentID)
		if env != nil {
			hasAccess, _ := srv.db.HasProjectAccess(user.Username, env.ProjectID, PermissionAdmin)
			if !hasAccess {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
		}
	}

	var req struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.UpdateServerTags(agentID, req.Tags); err != nil {
		http.Error(w, `{"error":"failed to update tags"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// ============================================================================
// Team Handlers
// ============================================================================

// handleListTeams handles GET /api/teams
func (srv *server) handleListTeams(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var teams []Team
	var err error

	// Superadmins see all teams, others see only their teams
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if isSuperAdmin {
		teams, err = srv.db.ListTeams()
	} else {
		teams, err = srv.db.ListTeamsForUser(user.Username)
	}

	if err != nil {
		http.Error(w, `{"error":"failed to list teams"}`, http.StatusInternalServerError)
		return
	}

	if teams == nil {
		teams = []Team{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(teams)
}

// handleCreateTeam handles POST /api/teams
func (srv *server) handleCreateTeam(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can create teams
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if req.Slug == "" {
		req.Slug = slugify(req.Name)
	}

	team, err := srv.db.CreateTeam(req.Name, req.Slug, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, `{"error":"team with this slug already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create team"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "create", "team", team.ID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": req.Name,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(team)
}

// handleGetTeam handles GET /api/teams/:id
func (srv *server) handleGetTeam(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is member of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	team, err := srv.db.GetTeam(teamID)
	if err != nil {
		http.Error(w, `{"error":"failed to get team"}`, http.StatusInternalServerError)
		return
	}
	if team == nil {
		http.Error(w, `{"error":"team not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(team)
}

// handleUpdateTeam handles PUT /api/teams/:id
func (srv *server) handleUpdateTeam(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is admin of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil || member.Role != TeamRoleAdmin {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.UpdateTeam(teamID, req.Name, req.Description); err != nil {
		http.Error(w, `{"error":"failed to update team"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "update", "team", teamID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"name": req.Name,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// handleDeleteTeam handles DELETE /api/teams/:id
func (srv *server) handleDeleteTeam(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can delete teams
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.DeleteTeam(teamID); err != nil {
		http.Error(w, `{"error":"failed to delete team"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "delete", "team", teamID, r.RemoteAddr, r.UserAgent(), nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// handleListTeamMembers handles GET /api/teams/:id/members
func (srv *server) handleListTeamMembers(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is member of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	members, err := srv.db.ListTeamMembers(teamID)
	if err != nil {
		http.Error(w, `{"error":"failed to list team members"}`, http.StatusInternalServerError)
		return
	}

	if members == nil {
		members = []TeamMember{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

// handleAddTeamMember handles POST /api/teams/:id/members
func (srv *server) handleAddTeamMember(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is admin of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil || member.Role != TeamRoleAdmin {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	var req struct {
		Username string   `json:"username"`
		Role     TeamRole `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, `{"error":"username is required"}`, http.StatusBadRequest)
		return
	}

	if req.Role == "" {
		req.Role = TeamRoleMember
	}

	if err := srv.db.AddTeamMember(teamID, req.Username, req.Role); err != nil {
		http.Error(w, `{"error":"failed to add team member"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "add_member", "team", teamID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"member_username": req.Username,
		"role":            string(req.Role),
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "added"})
}

// handleRemoveTeamMember handles DELETE /api/teams/:id/members/:username
func (srv *server) handleRemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	username := r.PathValue("username")
	if teamID == "" || username == "" {
		http.Error(w, `{"error":"team ID and username required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is admin of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil || member.Role != TeamRoleAdmin {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	if err := srv.db.RemoveTeamMember(teamID, username); err != nil {
		http.Error(w, `{"error":"failed to remove team member"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "remove_member", "team", teamID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"member_username": username,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "removed"})
}

// handleGrantProjectAccess handles POST /api/teams/:id/projects
func (srv *server) handleGrantProjectAccess(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can grant project access
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		ProjectID  string     `json:"project_id"`
		Permission Permission `json:"permission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.ProjectID == "" {
		http.Error(w, `{"error":"project_id is required"}`, http.StatusBadRequest)
		return
	}

	if req.Permission == "" {
		req.Permission = PermissionRead
	}

	if err := srv.db.GrantProjectAccess(teamID, req.ProjectID, req.Permission, user.Username); err != nil {
		http.Error(w, `{"error":"failed to grant project access"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "grant_access", "team_project", teamID+":"+req.ProjectID, r.RemoteAddr, r.UserAgent(), map[string]string{
		"project_id": req.ProjectID,
		"permission": string(req.Permission),
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "granted"})
}

// handleRevokeProjectAccess handles DELETE /api/teams/:id/projects/:projectId
func (srv *server) handleRevokeProjectAccess(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only superadmins can revoke project access
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
		return
	}

	teamID := r.PathValue("id")
	projectID := r.PathValue("projectId")
	if teamID == "" || projectID == "" {
		http.Error(w, `{"error":"team ID and project ID required"}`, http.StatusBadRequest)
		return
	}

	if err := srv.db.RevokeProjectAccess(teamID, projectID); err != nil {
		http.Error(w, `{"error":"failed to revoke project access"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	srv.db.CreateAuditLog(user.Username, "revoke_access", "team_project", teamID+":"+projectID, r.RemoteAddr, r.UserAgent(), nil)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "revoked"})
}

// handleListTeamProjects handles GET /api/teams/:id/projects
func (srv *server) handleListTeamProjects(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, `{"error":"team ID required"}`, http.StatusBadRequest)
		return
	}

	// Check if user is member of team or superadmin
	isSuperAdmin, _ := srv.db.IsSuperAdmin(user.Username)
	if !isSuperAdmin {
		member, _ := srv.db.GetTeamMember(teamID, user.Username)
		if member == nil {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
	}

	access, err := srv.db.ListTeamProjectAccess(teamID)
	if err != nil {
		http.Error(w, `{"error":"failed to list team projects"}`, http.StatusInternalServerError)
		return
	}

	if access == nil {
		access = []TeamProjectAccess{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(access)
}
