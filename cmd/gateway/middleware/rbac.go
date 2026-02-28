package middleware

import (
	"context"
	"net/http"
)

// Permission levels
type Permission string

const (
	PermissionRead    Permission = "read"
	PermissionWrite   Permission = "write"
	PermissionOperate Permission = "operate"
	PermissionAdmin   Permission = "admin"
)

// RBACChecker is the interface for checking RBAC permissions
type RBACChecker interface {
	IsSuperAdmin(username string) (bool, error)
	HasProjectAccess(username, projectID string, permission Permission) (bool, error)
	GetVisibleAgentIDs(username string) ([]string, error)
}

// ContextKey for storing RBAC data in request context
type rbacContextKey string

const (
	visibleAgentsKey rbacContextKey = "visible_agents"
	isSuperAdminKey  rbacContextKey = "is_superadmin"
)

// RequireSuperAdmin middleware ensures the user is a superadmin
func RequireSuperAdmin(checker RBACChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			isSuperAdmin, err := checker.IsSuperAdmin(user.Username)
			if err != nil {
				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
				return
			}

			if !isSuperAdmin {
				http.Error(w, `{"error":"forbidden","message":"superadmin access required"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireProjectAccess middleware ensures the user has access to the specified project
func RequireProjectAccess(checker RBACChecker, projectIDExtractor func(*http.Request) string, requiredPermission Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			projectID := projectIDExtractor(r)
			if projectID == "" {
				http.Error(w, `{"error":"bad request","message":"project ID required"}`, http.StatusBadRequest)
				return
			}

			hasAccess, err := checker.HasProjectAccess(user.Username, projectID, requiredPermission)
			if err != nil {
				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
				return
			}

			if !hasAccess {
				http.Error(w, `{"error":"forbidden","message":"insufficient project access"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// InjectVisibleAgents middleware injects the list of visible agent IDs into the context
func InjectVisibleAgents(checker RBACChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				next.ServeHTTP(w, r)
				return
			}

			// Check superadmin status
			isSuperAdmin, _ := checker.IsSuperAdmin(user.Username)
			ctx := context.WithValue(r.Context(), isSuperAdminKey, isSuperAdmin)

			// Get visible agents
			agents, err := checker.GetVisibleAgentIDs(user.Username)
			if err == nil {
				ctx = context.WithValue(ctx, visibleAgentsKey, agents)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetVisibleAgentsFromContext retrieves visible agent IDs from context
func GetVisibleAgentsFromContext(ctx context.Context) []string {
	if agents, ok := ctx.Value(visibleAgentsKey).([]string); ok {
		return agents
	}
	return nil
}

// IsSuperAdminFromContext checks if the user is a superadmin from context
func IsSuperAdminFromContext(ctx context.Context) bool {
	if isSuperAdmin, ok := ctx.Value(isSuperAdminKey).(bool); ok {
		return isSuperAdmin
	}
	return false
}

// IsAgentVisible checks if a specific agent is visible to the user
func IsAgentVisible(ctx context.Context, agentID string) bool {
	if IsSuperAdminFromContext(ctx) {
		return true
	}

	agents := GetVisibleAgentsFromContext(ctx)
	if agents == nil {
		return false
	}

	for _, a := range agents {
		if a == agentID {
			return true
		}
	}
	return false
}

// FilterVisibleAgents filters a list of agent IDs to only those visible to the user
func FilterVisibleAgents(ctx context.Context, agentIDs []string) []string {
	if IsSuperAdminFromContext(ctx) {
		return agentIDs
	}

	visible := GetVisibleAgentsFromContext(ctx)
	if visible == nil {
		return nil
	}

	visibleSet := make(map[string]bool)
	for _, a := range visible {
		visibleSet[a] = true
	}

	var filtered []string
	for _, a := range agentIDs {
		if visibleSet[a] {
			filtered = append(filtered, a)
		}
	}
	return filtered
}
