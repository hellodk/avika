package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avika-ai/avika/cmd/gateway/middleware"
)

// mockDB implements a subset of DB methods for testing
type mockDB struct {
	isSuperAdmin       bool
	projects           []Project
	projectsForUser    []Project
	hasProjectAccess   bool
	visibleAgents      []string
	createProjectErr   error
	createdProject     *Project
}

func (m *mockDB) IsSuperAdmin(username string) (bool, error) {
	return m.isSuperAdmin, nil
}

func (m *mockDB) ListProjects() ([]Project, error) {
	return m.projects, nil
}

func (m *mockDB) ListProjectsForUser(username string) ([]Project, error) {
	return m.projectsForUser, nil
}

func (m *mockDB) HasProjectAccess(username, projectID string, permission Permission) (bool, error) {
	return m.hasProjectAccess, nil
}

func (m *mockDB) GetVisibleAgentIDs(username string) ([]string, error) {
	return m.visibleAgents, nil
}

func (m *mockDB) CreateProject(name, slug, description, createdBy string) (*Project, error) {
	if m.createProjectErr != nil {
		return nil, m.createProjectErr
	}
	if m.createdProject != nil {
		return m.createdProject, nil
	}
	return &Project{
		ID:          "test-id",
		Name:        name,
		Slug:        slug,
		Description: description,
		CreatedBy:   createdBy,
	}, nil
}

func (m *mockDB) CreateDefaultEnvironments(projectID string) error {
	return nil
}

func (m *mockDB) CreateAuditLog(username, action, resourceType, resourceID, ipAddress, userAgent string, details interface{}) error {
	return nil
}

// Helper to create a request with user context
func requestWithUser(method, path string, body []byte, user *middleware.User) *http.Request {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	if user != nil {
		ctx := context.WithValue(req.Context(), middleware.UserContextKey, user)
		req = req.WithContext(ctx)
	}
	return req
}

func TestHandleListProjects_Unauthorized(t *testing.T) {
	srv := &server{
		db: &DB{},
	}

	req := httptest.NewRequest("GET", "/api/projects", nil)
	rec := httptest.NewRecorder()

	srv.handleListProjects(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestSlugifyFunction(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Hello World", "hello-world"},
		{"My Project", "my-project"},
		{"Test 123", "test-123"},
		{"UPPERCASE", "uppercase"},
		{"special!@#chars", "special-chars"},
	}

	for _, tt := range tests {
		result := slugify(tt.input)
		if result != tt.expected {
			t.Errorf("slugify(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestCreateProjectRequest_Validation(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		valid    bool
	}{
		{"valid name", `{"name":"Test Project"}`, true},
		{"empty name", `{"name":""}`, false},
		{"with slug", `{"name":"Test","slug":"test-slug"}`, true},
		{"with description", `{"name":"Test","description":"A test project"}`, true},
		{"invalid json", `{invalid}`, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				Name        string `json:"name"`
				Slug        string `json:"slug"`
				Description string `json:"description"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.Name != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestEnvironmentRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid name", `{"name":"Production"}`, true},
		{"empty name", `{"name":""}`, false},
		{"with color", `{"name":"Staging","color":"#eab308"}`, true},
		{"is_production true", `{"name":"Prod","is_production":true}`, true},
		{"with sort_order", `{"name":"Dev","sort_order":3}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				Name         string `json:"name"`
				Slug         string `json:"slug"`
				Description  string `json:"description"`
				Color        string `json:"color"`
				SortOrder    int    `json:"sort_order"`
				IsProduction bool   `json:"is_production"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.Name != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestTeamRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid name", `{"name":"Platform Team"}`, true},
		{"empty name", `{"name":""}`, false},
		{"with slug", `{"name":"DevOps","slug":"devops"}`, true},
		{"with description", `{"name":"QA","description":"QA team"}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				Name        string `json:"name"`
				Slug        string `json:"slug"`
				Description string `json:"description"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.Name != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestServerAssignRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid environment_id", `{"environment_id":"env-123"}`, true},
		{"empty environment_id", `{"environment_id":""}`, false},
		{"with display_name", `{"environment_id":"env-1","display_name":"Prod LB"}`, true},
		{"with tags", `{"environment_id":"env-1","tags":["lb","primary"]}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				EnvironmentID string   `json:"environment_id"`
				DisplayName   string   `json:"display_name"`
				Tags          []string `json:"tags"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.EnvironmentID != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestTeamMemberRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid username", `{"username":"john.doe"}`, true},
		{"empty username", `{"username":""}`, false},
		{"with role", `{"username":"jane","role":"admin"}`, true},
		{"member role", `{"username":"bob","role":"member"}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				Username string   `json:"username"`
				Role     TeamRole `json:"role"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.Username != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestProjectAccessRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid project_id", `{"project_id":"proj-123"}`, true},
		{"empty project_id", `{"project_id":""}`, false},
		{"with permission", `{"project_id":"proj-1","permission":"admin"}`, true},
		{"read permission", `{"project_id":"proj-1","permission":"read"}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				ProjectID  string     `json:"project_id"`
				Permission Permission `json:"permission"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			isValid := err == nil && req.ProjectID != ""
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}

func TestTagsRequest_Validation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"valid tags", `{"tags":["lb","primary"]}`, true},
		{"empty tags", `{"tags":[]}`, true},
		{"single tag", `{"tags":["production"]}`, true},
		{"null tags", `{"tags":null}`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req struct {
				Tags []string `json:"tags"`
			}
			err := json.Unmarshal([]byte(tt.input), &req)
			
			// Tags can be empty or null, that's valid
			isValid := err == nil
			if isValid != tt.valid {
				t.Errorf("Validation for %q: got valid=%v, want valid=%v", tt.input, isValid, tt.valid)
			}
		})
	}
}
