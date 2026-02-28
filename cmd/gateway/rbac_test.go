package main

import (
	"testing"
)

func TestSlugify(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"simple lowercase", "hello", "hello"},
		{"with spaces", "Hello World", "hello-world"},
		{"with special chars", "Hello! @World#", "hello-world"},
		{"multiple spaces", "Hello   World", "hello-world"},
		{"leading trailing spaces", "  Hello World  ", "hello-world"},
		{"numbers", "Project 123", "project-123"},
		{"mixed case", "MyProject", "myproject"},
		{"unicode", "Café Project", "caf-project"},
		{"empty string", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := slugify(tt.input)
			if result != tt.expected {
				t.Errorf("slugify(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestPermissionLevel(t *testing.T) {
	tests := []struct {
		permission Permission
		expected   int
	}{
		{PermissionRead, 1},
		{PermissionWrite, 2},
		{PermissionOperate, 3},
		{PermissionAdmin, 4},
		{Permission("unknown"), 0},
		{Permission(""), 0},
	}

	for _, tt := range tests {
		t.Run(string(tt.permission), func(t *testing.T) {
			result := permissionLevel(tt.permission)
			if result != tt.expected {
				t.Errorf("permissionLevel(%q) = %d, want %d", tt.permission, result, tt.expected)
			}
		})
	}
}

func TestPermissionComparison(t *testing.T) {
	tests := []struct {
		name      string
		required  Permission
		actual    Permission
		hasAccess bool
	}{
		{"read can read", PermissionRead, PermissionRead, true},
		{"write can read", PermissionRead, PermissionWrite, true},
		{"operate can read", PermissionRead, PermissionOperate, true},
		{"admin can read", PermissionRead, PermissionAdmin, true},
		{"read cannot write", PermissionWrite, PermissionRead, false},
		{"write can write", PermissionWrite, PermissionWrite, true},
		{"operate can write", PermissionWrite, PermissionOperate, true},
		{"admin can write", PermissionWrite, PermissionAdmin, true},
		{"read cannot operate", PermissionOperate, PermissionRead, false},
		{"write cannot operate", PermissionOperate, PermissionWrite, false},
		{"operate can operate", PermissionOperate, PermissionOperate, true},
		{"admin can operate", PermissionOperate, PermissionAdmin, true},
		{"read cannot admin", PermissionAdmin, PermissionRead, false},
		{"write cannot admin", PermissionAdmin, PermissionWrite, false},
		{"operate cannot admin", PermissionAdmin, PermissionOperate, false},
		{"admin can admin", PermissionAdmin, PermissionAdmin, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := permissionLevel(tt.actual) >= permissionLevel(tt.required)
			if result != tt.hasAccess {
				t.Errorf("permission check failed: actual=%q required=%q, got %v want %v",
					tt.actual, tt.required, result, tt.hasAccess)
			}
		})
	}
}

func TestProjectStructFields(t *testing.T) {
	p := Project{
		ID:          "test-id",
		Name:        "Test Project",
		Slug:        "test-project",
		Description: "A test project",
	}

	if p.ID != "test-id" {
		t.Errorf("Project.ID = %q, want %q", p.ID, "test-id")
	}
	if p.Name != "Test Project" {
		t.Errorf("Project.Name = %q, want %q", p.Name, "Test Project")
	}
	if p.Slug != "test-project" {
		t.Errorf("Project.Slug = %q, want %q", p.Slug, "test-project")
	}
}

func TestEnvironmentStructFields(t *testing.T) {
	e := Environment{
		ID:           "env-id",
		ProjectID:    "project-id",
		Name:         "Production",
		Slug:         "production",
		Color:        "#ef4444",
		SortOrder:    1,
		IsProduction: true,
	}

	if e.ID != "env-id" {
		t.Errorf("Environment.ID = %q, want %q", e.ID, "env-id")
	}
	if !e.IsProduction {
		t.Error("Environment.IsProduction should be true")
	}
	if e.SortOrder != 1 {
		t.Errorf("Environment.SortOrder = %d, want %d", e.SortOrder, 1)
	}
}

func TestTeamRoleConstants(t *testing.T) {
	if TeamRoleAdmin != "admin" {
		t.Errorf("TeamRoleAdmin = %q, want %q", TeamRoleAdmin, "admin")
	}
	if TeamRoleMember != "member" {
		t.Errorf("TeamRoleMember = %q, want %q", TeamRoleMember, "member")
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

func TestServerAssignmentStructFields(t *testing.T) {
	tags := []string{"load-balancer", "primary"}
	sa := ServerAssignment{
		AgentID:       "agent-1",
		EnvironmentID: "env-1",
		DisplayName:   "Production LB 1",
		Tags:          tags,
	}

	if sa.AgentID != "agent-1" {
		t.Errorf("ServerAssignment.AgentID = %q, want %q", sa.AgentID, "agent-1")
	}
	if len(sa.Tags) != 2 {
		t.Errorf("ServerAssignment.Tags length = %d, want %d", len(sa.Tags), 2)
	}
	if sa.Tags[0] != "load-balancer" {
		t.Errorf("ServerAssignment.Tags[0] = %q, want %q", sa.Tags[0], "load-balancer")
	}
}

func TestTeamStructFields(t *testing.T) {
	team := Team{
		ID:          "team-1",
		Name:        "Platform Team",
		Slug:        "platform-team",
		Description: "Platform engineering team",
	}

	if team.ID != "team-1" {
		t.Errorf("Team.ID = %q, want %q", team.ID, "team-1")
	}
	if team.Slug != "platform-team" {
		t.Errorf("Team.Slug = %q, want %q", team.Slug, "platform-team")
	}
}

func TestTeamMemberStructFields(t *testing.T) {
	member := TeamMember{
		TeamID:   "team-1",
		Username: "john.doe",
		Role:     TeamRoleAdmin,
	}

	if member.TeamID != "team-1" {
		t.Errorf("TeamMember.TeamID = %q, want %q", member.TeamID, "team-1")
	}
	if member.Role != TeamRoleAdmin {
		t.Errorf("TeamMember.Role = %q, want %q", member.Role, TeamRoleAdmin)
	}
}

func TestTeamProjectAccessStructFields(t *testing.T) {
	access := TeamProjectAccess{
		TeamID:     "team-1",
		ProjectID:  "project-1",
		Permission: PermissionAdmin,
		GrantedBy:  "admin",
	}

	if access.TeamID != "team-1" {
		t.Errorf("TeamProjectAccess.TeamID = %q, want %q", access.TeamID, "team-1")
	}
	if access.Permission != PermissionAdmin {
		t.Errorf("TeamProjectAccess.Permission = %q, want %q", access.Permission, PermissionAdmin)
	}
}

func TestUserAccessStructFields(t *testing.T) {
	ua := UserAccess{
		Username:     "testuser",
		IsSuperAdmin: true,
		Teams:        []TeamMember{{TeamID: "team-1", Username: "testuser", Role: TeamRoleAdmin}},
		ProjectAccess: map[string]Permission{
			"project-1": PermissionAdmin,
			"project-2": PermissionRead,
		},
	}

	if ua.Username != "testuser" {
		t.Errorf("UserAccess.Username = %q, want %q", ua.Username, "testuser")
	}
	if !ua.IsSuperAdmin {
		t.Error("UserAccess.IsSuperAdmin should be true")
	}
	if len(ua.Teams) != 1 {
		t.Errorf("UserAccess.Teams length = %d, want %d", len(ua.Teams), 1)
	}
	if len(ua.ProjectAccess) != 2 {
		t.Errorf("UserAccess.ProjectAccess length = %d, want %d", len(ua.ProjectAccess), 2)
	}
	if ua.ProjectAccess["project-1"] != PermissionAdmin {
		t.Errorf("UserAccess.ProjectAccess[project-1] = %q, want %q", ua.ProjectAccess["project-1"], PermissionAdmin)
	}
}

func TestAuditLogStructFields(t *testing.T) {
	log := AuditLog{
		ID:           "log-1",
		Username:     "admin",
		Action:       "create",
		ResourceType: "project",
		ResourceID:   "project-1",
		IPAddress:    "192.168.1.1",
		UserAgent:    "Mozilla/5.0",
	}

	if log.Action != "create" {
		t.Errorf("AuditLog.Action = %q, want %q", log.Action, "create")
	}
	if log.ResourceType != "project" {
		t.Errorf("AuditLog.ResourceType = %q, want %q", log.ResourceType, "project")
	}
}
