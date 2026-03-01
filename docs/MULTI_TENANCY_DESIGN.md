# Multi-Tenancy and RBAC Architecture for Avika

## Executive Summary

This document outlines the architecture for implementing project-based server organization with role-based access control (RBAC) in Avika. The design enables teams to manage NGINX servers grouped by projects and environments with strict access isolation.

## Table of Contents

1. [Organizational Hierarchy](#1-organizational-hierarchy)
2. [Database Schema](#2-database-schema)
3. [Access Control Model](#3-access-control-model)
4. [API Design](#4-api-design)
5. [Agent Registration](#5-agent-registration)
6. [External Identity Provider Integration](#6-external-identity-provider-integration)
7. [Frontend Changes](#7-frontend-changes)
8. [Migration Strategy](#8-migration-strategy)

---

## 1. Organizational Hierarchy

```
Project
├── Environment: Production
│   ├── Server 1
│   └── Server 2
├── Environment: Staging
│   └── Server 3
└── Environment: Development
    └── Server 4

Team
├── User 1
├── User 2
└── User 3
    └── Access to Project(s)
```

### Entities

| Entity | Description | Example |
|--------|-------------|---------|
| **Project** | Top-level grouping for related NGINX servers | "E-Commerce Platform", "Mobile API" |
| **Environment** | Deployment stage within a project | production, staging, dev, qa |
| **Server** | Individual NGINX agent assigned to an environment | `nginx-prod-01.example.com` |
| **Team** | Group of users with shared access to projects | "Platform Team", "DevOps" |
| **User** | Individual with role-based permissions | `john.doe@example.com` |

### Design Decisions

- **No Organization Layer**: Simplified hierarchy (Project → Environment → Server) without an org layer
- **Strict Isolation**: Teams can ONLY see servers in their assigned projects
- **Flexible Tagging**: Servers can have additional tags for filtering within projects

---

## 2. Database Schema

### 2.1 New Tables

#### Projects Table

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100) REFERENCES users(username),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_created_by ON projects(created_by);
```

#### Environments Table

```sql
CREATE TABLE environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    sort_order INT DEFAULT 0,
    is_production BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, slug)
);

CREATE INDEX idx_environments_project ON environments(project_id);
```

#### Server Assignments Table

```sql
CREATE TABLE server_assignments (
    agent_id TEXT PRIMARY KEY REFERENCES agents(agent_id) ON DELETE CASCADE,
    environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
    display_name VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    assigned_by VARCHAR(100) REFERENCES users(username),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_server_assignments_env ON server_assignments(environment_id);
CREATE INDEX idx_server_assignments_tags ON server_assignments USING GIN(tags);
```

#### Teams Table

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teams_slug ON teams(slug);
```

#### Team Membership Table

```sql
CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, username)
);

CREATE INDEX idx_team_members_username ON team_members(username);
```

#### Team Project Access Table

```sql
CREATE TABLE team_project_access (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    granted_by VARCHAR(100) REFERENCES users(username),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, project_id)
);

CREATE INDEX idx_team_project_access_project ON team_project_access(project_id);
```

### 2.2 Modify Existing Tables

#### Users Table Extensions

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_provider VARCHAR(50) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_identity_provider ON users(identity_provider);
```

### 2.3 Entity Relationship Diagram

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
│   projects  │──1:N─│  environments   │──1:N─│   agents     │
│             │      │                 │      │ (via assign) │
└─────────────┘      └─────────────────┘      └──────────────┘
       │                                              │
       │                                              │
       │ N:M                                          │
       │                                              │
┌──────▼──────┐      ┌─────────────────┐      ┌──────▼───────┐
│team_project │──N:1─│     teams       │──1:N─│team_members  │
│   _access   │      │                 │      │              │
└─────────────┘      └─────────────────┘      └──────────────┘
                                                     │
                                                     │ N:1
                                               ┌─────▼─────┐
                                               │   users   │
                                               └───────────┘
```

---

## 3. Access Control Model

### 3.1 Role Hierarchy

| Role | Scope | Description |
|------|-------|-------------|
| `superadmin` | Global | Full access to everything, can manage all projects and teams |
| `admin` | Team | Can manage team members, full access to team's assigned projects |
| `operator` | Project | Can deploy configs, restart servers, view logs in assigned projects |
| `developer` | Project | Can view configs, logs, metrics in assigned projects |
| `viewer` | Project | Read-only access to assigned projects |

### 3.2 Permission Matrix

| Action | superadmin | admin | operator | developer | viewer |
|--------|------------|-------|----------|-----------|--------|
| Create/Delete Projects | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage Teams | ✓ | ✓ (own team) | ✗ | ✗ | ✗ |
| Assign Servers | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit NGINX Config | ✓ | ✓ | ✓ | ✗ | ✗ |
| Deploy Config | ✓ | ✓ | ✓ | ✗ | ✗ |
| Restart NGINX | ✓ | ✓ | ✓ | ✗ | ✗ |
| View Logs | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Metrics | ✓ | ✓ | ✓ | ✓ | ✓ |
| Execute Terminal | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage Certificates | ✓ | ✓ | ✓ | ✗ | ✗ |

### 3.3 Permission Checking Flow

```
Request → Auth Middleware → RBAC Middleware → Handler
                │                  │
                ▼                  ▼
         Validate Token    Check Permission
                │                  │
                ▼                  ▼
         Get User Info     Get User's Teams
                           Get Team's Projects
                           Check Resource Access
                           Check Action Permission
```

### 3.4 Permission Definitions

```go
type Permission string

const (
    PermissionRead    Permission = "read"     // View resources
    PermissionWrite   Permission = "write"    // Edit configurations
    PermissionOperate Permission = "operate"  // Deploy, restart, execute
    PermissionAdmin   Permission = "admin"    // Manage assignments, environments
)
```

---

## 4. API Design

### 4.1 Projects API

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|---------------------|
| GET | `/api/projects` | List accessible projects | read |
| POST | `/api/projects` | Create project | superadmin |
| GET | `/api/projects/:id` | Get project details | read |
| PUT | `/api/projects/:id` | Update project | admin |
| DELETE | `/api/projects/:id` | Delete project | superadmin |

### 4.2 Environments API

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|---------------------|
| GET | `/api/projects/:id/environments` | List environments | read |
| POST | `/api/projects/:id/environments` | Create environment | admin |
| PUT | `/api/environments/:id` | Update environment | admin |
| DELETE | `/api/environments/:id` | Delete environment | admin |

### 4.3 Server Assignment API

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|---------------------|
| GET | `/api/servers/unassigned` | List unassigned servers | superadmin |
| POST | `/api/servers/:agentId/assign` | Assign to environment | admin |
| DELETE | `/api/servers/:agentId/assign` | Unassign server | admin |
| PUT | `/api/servers/:agentId/tags` | Update server tags | admin |

### 4.4 Teams API

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|---------------------|
| GET | `/api/teams` | List teams | superadmin or team member |
| POST | `/api/teams` | Create team | superadmin |
| GET | `/api/teams/:id` | Get team details | team member |
| PUT | `/api/teams/:id` | Update team | admin |
| DELETE | `/api/teams/:id` | Delete team | superadmin |
| GET | `/api/teams/:id/members` | List members | team member |
| POST | `/api/teams/:id/members` | Add member | admin |
| DELETE | `/api/teams/:id/members/:username` | Remove member | admin |
| GET | `/api/teams/:id/projects` | List project access | team member |
| POST | `/api/teams/:id/projects` | Grant project access | superadmin |
| DELETE | `/api/teams/:id/projects/:projectId` | Revoke access | superadmin |

### 4.5 Request/Response Examples

#### Create Project

```json
// POST /api/projects
{
    "name": "E-Commerce Platform",
    "slug": "ecommerce",
    "description": "Production e-commerce NGINX servers"
}

// Response 201
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "E-Commerce Platform",
    "slug": "ecommerce",
    "description": "Production e-commerce NGINX servers",
    "created_by": "admin",
    "created_at": "2026-02-26T10:00:00Z"
}
```

#### Assign Server to Environment

```json
// POST /api/servers/nginx-prod-01/assign
{
    "environment_id": "660e8400-e29b-41d4-a716-446655440001",
    "display_name": "Production LB 1",
    "tags": ["load-balancer", "primary"]
}

// Response 200
{
    "agent_id": "nginx-prod-01",
    "environment_id": "660e8400-e29b-41d4-a716-446655440001",
    "project": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "E-Commerce Platform"
    },
    "environment": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Production"
    }
}
```

---

## 5. Agent Registration

### 5.1 Registration Methods

#### Method A: Manual Assignment (Default)

1. Agent connects to gateway with `agent_id`
2. Agent appears in "Unassigned Servers" pool
3. Admin assigns to project/environment via UI

#### Method B: Auto-Assignment via Labels (Recommended)

Agent config includes project/environment labels that match existing project/environment slugs:

**Configuration via Environment Variables:**

```bash
# Required for auto-assignment
export AVIKA_LABEL_PROJECT=project-alpha     # Must match project slug exactly
export AVIKA_LABEL_ENVIRONMENT=dev           # Must match environment slug exactly

# Optional metadata
export AVIKA_LABEL_TEAM=platform
export AVIKA_LABEL_REGION=us-east-1
```

**Configuration via Config File:**

```ini
# /etc/avika/avika-agent.conf
LABEL_PROJECT=project-alpha
LABEL_ENVIRONMENT=production
LABEL_TEAM=platform
```

**Auto-Assignment Flow:**

```
Agent Heartbeat with Labels
         │
         ▼
┌─────────────────────────────────┐
│ Gateway extracts labels:        │
│   project: "project-alpha"      │
│   environment: "dev"            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Look up Project by slug         │──── Not Found ──► Log warning, skip
│ GetProjectBySlug("project-alpha")│
└─────────────┬───────────────────┘
              │ Found
              ▼
┌─────────────────────────────────┐
│ Look up Environment by slug     │──── Not Found ──► Log warning, skip
│ GetEnvironmentBySlug(proj, "dev")│
└─────────────┬───────────────────┘
              │ Found
              ▼
┌─────────────────────────────────┐
│ Check existing assignment       │──── Already assigned ──► Skip
│ GetServerAssignment(agentId)    │
└─────────────┬───────────────────┘
              │ Not assigned
              ▼
┌─────────────────────────────────┐
│ Auto-assign agent to environment│
│ AssignServer(agentId, envId)    │
└─────────────┬───────────────────┘
              │
              ▼
         ✓ Success
```

#### Method C: Environment Token

Generate environment-specific enrollment tokens:

```bash
# Generate token for production environment
POST /api/environments/:id/enrollment-token
```

Agent uses token for auto-assignment:

```yaml
# avika-agent.conf
gateway_url: "grpc://avika-gateway:5020"
enrollment_token: "env_tok_abc123..."
```

### 5.2 Label Configuration

**Protobuf Definition (Heartbeat message):**

```protobuf
message Heartbeat {
    string hostname = 1;
    string version = 2;
    double uptime = 3;
    repeated NginxInstance instances = 4;
    bool is_pod = 5;
    string pod_ip = 6;
    string agent_version = 7;
    string build_date = 8;
    string git_commit = 9;
    string git_branch = 10;
    map<string, string> labels = 11;  // Labels for auto-assignment
}
```

**Standard Label Keys:**

| Label Key | Environment Variable | Description | Example |
|-----------|---------------------|-------------|---------|
| `project` | `AVIKA_LABEL_PROJECT` | Project slug (required for auto-assign) | `project-alpha` |
| `environment` | `AVIKA_LABEL_ENVIRONMENT` | Environment slug (required for auto-assign) | `dev`, `stage`, `production` |
| `team` | `AVIKA_LABEL_TEAM` | Team identifier (metadata) | `platform` |
| `region` | `AVIKA_LABEL_REGION` | Geographic region (metadata) | `us-east-1` |

### 5.3 Kubernetes Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-alpha-dev
  namespace: avika
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-sidecar
      project: alpha
      environment: dev
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.28
        ports:
        - containerPort: 80
      
      - name: avika-agent
        image: hellodk/avika-agent:0.1.93
        env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: AVIKA_LABEL_PROJECT
          value: "project-alpha"        # Must match project slug
        - name: AVIKA_LABEL_ENVIRONMENT
          value: "dev"                  # Must match environment slug
        - name: AVIKA_LABEL_TEAM
          value: "platform"
```

### 5.4 Prerequisites for Auto-Assignment

Before agents can auto-assign, projects and environments must exist:

```bash
# 1. Create project
curl -b cookies.txt -X POST "http://gateway:5021/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Project Alpha","slug":"project-alpha","description":"Platform services"}'

# 2. Create environments (use project_id from response)
curl -b cookies.txt -X POST "http://gateway:5021/api/projects/{project_id}/environments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Development","slug":"dev","color":"#22c55e"}'
```

### 5.5 Troubleshooting Auto-Assignment

**Check gateway logs:**
```bash
kubectl logs deploy/avika-gateway -n avika | grep -i "auto-assign"
```

**Common issues:**

| Log Message | Cause | Solution |
|-------------|-------|----------|
| `project 'alpha' not found` | Label uses `alpha` but slug is `project-alpha` | Use exact project slug |
| `environment 'development' not found` | Label uses `development` but slug is `dev` | Use exact environment slug |
| `already assigned to environment` | Agent was previously assigned | Delete existing assignment first |

**Verify assignments:**
```bash
curl -b cookies.txt "http://gateway:5021/api/server-assignments" | jq '.assignments'
```

---

## 6. External Identity Provider Integration

### 6.1 Supported Providers

- **Local**: Built-in username/password authentication
- **OIDC**: Keycloak, Okta, Auth0, Azure AD, Google Workspace

### 6.2 OIDC Configuration

```yaml
auth:
  providers:
    local:
      enabled: true
    oidc:
      enabled: true
      issuer: "https://keycloak.example.com/realms/avika"
      client_id: "avika-gateway"
      client_secret: "${OIDC_CLIENT_SECRET}"
      redirect_uri: "https://avika.example.com/api/auth/callback"
      scopes:
        - openid
        - profile
        - email
        - groups
      claims:
        username: "preferred_username"
        email: "email"
        groups: "groups"
      group_mapping:
        "avika-superadmins": 
          role: "superadmin"
        "avika-admins":
          role: "admin"
        "/project-ecommerce-admins":
          team: "ecommerce-team"
          role: "admin"
```

### 6.3 Authentication Flow

```
1. User clicks "Login with SSO"
2. Frontend redirects to /api/auth/oidc/login
3. Gateway redirects to OIDC provider
4. User authenticates with provider
5. Provider redirects back with authorization code
6. Gateway exchanges code for tokens
7. Gateway extracts user info and groups
8. Gateway creates/updates local user record
9. Gateway syncs team memberships from groups
10. Gateway issues session token
11. User redirected to frontend with session
```

---

## 7. Frontend Changes

### 7.1 New Components

#### Project Selector (Header)

- Dropdown showing user's accessible projects
- "All Projects" option for superadmins
- Persists selection in localStorage
- Updates URL query parameter

#### Environment Tabs

- Horizontal tabs below header
- Color-coded (production=red, staging=yellow, dev=blue)
- Click to filter servers by environment

#### Team Management Pages

- `/settings/teams` - List teams, create new team
- `/settings/teams/:id` - Team details, members, project access
- Member management with role selection
- Project access grant/revoke

#### Server Assignment UI

- Drag-and-drop interface
- "Unassigned" pool on left
- Environment targets on right
- Bulk assignment actions

### 7.2 Updated Pages

| Page | Changes |
|------|---------|
| `/inventory` | Project/environment filters, grouped view option |
| `/servers/[id]` | Project/environment breadcrumb, assignment controls |
| `/analytics` | Filter by project/environment |
| `/settings` | Add Teams, Projects sections |
| `/login` | Add "Login with SSO" button |

### 7.3 State Management

```typescript
interface AppState {
    currentProject: Project | null;
    currentEnvironment: Environment | null;
    userTeams: Team[];
    accessibleProjects: Project[];
}
```

---

## 8. Migration Strategy

### Phase 1: Database & Core Backend

**Branch**: `feature/multi-tenancy-backend`

1. Add database migrations (003_projects.sql, 004_teams.sql, 005_rbac.sql)
2. Implement Go structs and database queries
3. Implement project/environment/team CRUD APIs
4. Add RBAC middleware
5. Modify existing endpoints for access filtering
6. Add comprehensive tests

**Deliverables**:
- New database schema
- Project, Environment, Team APIs
- RBAC middleware
- Modified agent/analytics endpoints

### Phase 2: Agent Labels

**Branch**: `feature/agent-labels`

1. Add labels to agent protobuf
2. Update agent to send labels from config
3. Implement auto-assignment logic in gateway
4. Add enrollment token support

**Deliverables**:
- Agent label support
- Auto-assignment feature
- Enrollment tokens

### Phase 3: Frontend

**Branch**: `feature/multi-tenancy-ui`

1. Implement project selector component
2. Implement environment tabs
3. Update inventory page with filters
4. Add team management pages
5. Add server assignment UI
6. Update all pages with project context

**Deliverables**:
- Project/environment navigation
- Team management UI
- Server assignment UI

### Phase 4: OIDC Integration

**Branch**: `feature/oidc-auth`

1. Implement OIDC provider
2. Add group-to-team sync
3. Update login flow
4. Add identity provider configuration page

**Deliverables**:
- OIDC authentication
- Group sync
- SSO login

---

## Appendix A: Default Environments

When a project is created, these default environments are auto-created:

| Name | Slug | Color | Sort Order | Is Production |
|------|------|-------|------------|---------------|
| Production | production | #ef4444 | 1 | true |
| Staging | staging | #eab308 | 2 | false |
| Development | development | #3b82f6 | 3 | false |

---

## Appendix B: Audit Logging

All RBAC-sensitive actions should be logged:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT
);
```

Actions to log:
- Project create/update/delete
- Environment create/update/delete
- Server assignment/unassignment
- Team create/update/delete
- Team member add/remove
- Project access grant/revoke
- Login/logout
- Permission denied events
