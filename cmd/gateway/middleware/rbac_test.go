package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// MockRBACChecker implements RBACChecker for testing
type MockRBACChecker struct {
	IsSuperAdminFunc     func(username string) (bool, error)
	HasProjectAccessFunc func(username, projectID string, permission Permission) (bool, error)
	GetVisibleAgentIDsFunc func(username string) ([]string, error)
}

func (m *MockRBACChecker) IsSuperAdmin(username string) (bool, error) {
	if m.IsSuperAdminFunc != nil {
		return m.IsSuperAdminFunc(username)
	}
	return false, nil
}

func (m *MockRBACChecker) HasProjectAccess(username, projectID string, permission Permission) (bool, error) {
	if m.HasProjectAccessFunc != nil {
		return m.HasProjectAccessFunc(username, projectID, permission)
	}
	return false, nil
}

func (m *MockRBACChecker) GetVisibleAgentIDs(username string) ([]string, error) {
	if m.GetVisibleAgentIDsFunc != nil {
		return m.GetVisibleAgentIDsFunc(username)
	}
	return nil, nil
}

func TestRequireSuperAdmin_NoUser(t *testing.T) {
	checker := &MockRBACChecker{}
	middleware := RequireSuperAdmin(checker)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestRequireSuperAdmin_NotSuperAdmin(t *testing.T) {
	checker := &MockRBACChecker{
		IsSuperAdminFunc: func(username string) (bool, error) {
			return false, nil
		},
	}
	middleware := RequireSuperAdmin(checker)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Add user to context
	user := &User{Username: "testuser"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected status %d, got %d", http.StatusForbidden, rec.Code)
	}
}

func TestRequireSuperAdmin_IsSuperAdmin(t *testing.T) {
	checker := &MockRBACChecker{
		IsSuperAdminFunc: func(username string) (bool, error) {
			return true, nil
		},
	}
	middleware := RequireSuperAdmin(checker)

	handlerCalled := false
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "admin"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if !handlerCalled {
		t.Error("Handler should have been called")
	}
}

func TestRequireProjectAccess_NoUser(t *testing.T) {
	checker := &MockRBACChecker{}
	extractor := func(r *http.Request) string { return "project-1" }
	middleware := RequireProjectAccess(checker, extractor, PermissionRead)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestRequireProjectAccess_NoProjectID(t *testing.T) {
	checker := &MockRBACChecker{}
	extractor := func(r *http.Request) string { return "" }
	middleware := RequireProjectAccess(checker, extractor, PermissionRead)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "testuser"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestRequireProjectAccess_NoAccess(t *testing.T) {
	checker := &MockRBACChecker{
		HasProjectAccessFunc: func(username, projectID string, permission Permission) (bool, error) {
			return false, nil
		},
	}
	extractor := func(r *http.Request) string { return "project-1" }
	middleware := RequireProjectAccess(checker, extractor, PermissionRead)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "testuser"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected status %d, got %d", http.StatusForbidden, rec.Code)
	}
}

func TestRequireProjectAccess_HasAccess(t *testing.T) {
	checker := &MockRBACChecker{
		HasProjectAccessFunc: func(username, projectID string, permission Permission) (bool, error) {
			return true, nil
		},
	}
	extractor := func(r *http.Request) string { return "project-1" }
	middleware := RequireProjectAccess(checker, extractor, PermissionRead)

	handlerCalled := false
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "testuser"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if !handlerCalled {
		t.Error("Handler should have been called")
	}
}

func TestInjectVisibleAgents(t *testing.T) {
	expectedAgents := []string{"agent-1", "agent-2"}
	checker := &MockRBACChecker{
		IsSuperAdminFunc: func(username string) (bool, error) {
			return false, nil
		},
		GetVisibleAgentIDsFunc: func(username string) ([]string, error) {
			return expectedAgents, nil
		},
	}
	middleware := InjectVisibleAgents(checker)

	var capturedAgents []string
	var capturedIsSuperAdmin bool
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAgents = GetVisibleAgentsFromContext(r.Context())
		capturedIsSuperAdmin = IsSuperAdminFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "testuser"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if len(capturedAgents) != len(expectedAgents) {
		t.Errorf("Expected %d agents, got %d", len(expectedAgents), len(capturedAgents))
	}
	if capturedIsSuperAdmin {
		t.Error("Should not be superadmin")
	}
}

func TestInjectVisibleAgents_SuperAdmin(t *testing.T) {
	checker := &MockRBACChecker{
		IsSuperAdminFunc: func(username string) (bool, error) {
			return true, nil
		},
		GetVisibleAgentIDsFunc: func(username string) ([]string, error) {
			return []string{"all-agents"}, nil
		},
	}
	middleware := InjectVisibleAgents(checker)

	var capturedIsSuperAdmin bool
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedIsSuperAdmin = IsSuperAdminFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	user := &User{Username: "admin"}
	ctx := context.WithValue(context.Background(), UserContextKey, user)
	req := httptest.NewRequest("GET", "/test", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !capturedIsSuperAdmin {
		t.Error("Should be superadmin")
	}
}

func TestGetVisibleAgentsFromContext_NoValue(t *testing.T) {
	agents := GetVisibleAgentsFromContext(context.Background())
	if agents != nil {
		t.Errorf("Expected nil, got %v", agents)
	}
}

func TestIsSuperAdminFromContext_NoValue(t *testing.T) {
	isSuperAdmin := IsSuperAdminFromContext(context.Background())
	if isSuperAdmin {
		t.Error("Expected false when no value in context")
	}
}

func TestIsAgentVisible_SuperAdmin(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, true)
	if !IsAgentVisible(ctx, "any-agent") {
		t.Error("Superadmin should see any agent")
	}
}

func TestIsAgentVisible_InList(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, false)
	ctx = context.WithValue(ctx, visibleAgentsKey, []string{"agent-1", "agent-2"})

	if !IsAgentVisible(ctx, "agent-1") {
		t.Error("Agent-1 should be visible")
	}
	if !IsAgentVisible(ctx, "agent-2") {
		t.Error("Agent-2 should be visible")
	}
	if IsAgentVisible(ctx, "agent-3") {
		t.Error("Agent-3 should not be visible")
	}
}

func TestIsAgentVisible_NoAgents(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, false)
	if IsAgentVisible(ctx, "any-agent") {
		t.Error("Should not be visible when no agents in context")
	}
}

func TestFilterVisibleAgents_SuperAdmin(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, true)
	agents := []string{"agent-1", "agent-2", "agent-3"}
	filtered := FilterVisibleAgents(ctx, agents)

	if len(filtered) != len(agents) {
		t.Errorf("Superadmin should see all agents, got %d, want %d", len(filtered), len(agents))
	}
}

func TestFilterVisibleAgents_RegularUser(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, false)
	ctx = context.WithValue(ctx, visibleAgentsKey, []string{"agent-1", "agent-3"})

	agents := []string{"agent-1", "agent-2", "agent-3", "agent-4"}
	filtered := FilterVisibleAgents(ctx, agents)

	if len(filtered) != 2 {
		t.Errorf("Expected 2 visible agents, got %d", len(filtered))
	}
}

func TestFilterVisibleAgents_NoAgents(t *testing.T) {
	ctx := context.WithValue(context.Background(), isSuperAdminKey, false)
	agents := []string{"agent-1", "agent-2"}
	filtered := FilterVisibleAgents(ctx, agents)

	if filtered != nil {
		t.Errorf("Expected nil when no visible agents, got %v", filtered)
	}
}

func TestPermissionConstants(t *testing.T) {
	if PermissionRead != "read" {
		t.Errorf("PermissionRead = %q, want %q", PermissionRead, "read")
	}
	if PermissionWrite != "write" {
		t.Errorf("PermissionWrite = %q, want %q", PermissionWrite, "write")
	}
	if PermissionOperate != "operate" {
		t.Errorf("PermissionOperate = %q, want %q", PermissionOperate, "operate")
	}
	if PermissionAdmin != "admin" {
		t.Errorf("PermissionAdmin = %q, want %q", PermissionAdmin, "admin")
	}
}
