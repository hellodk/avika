# Agent Labeling and Auto-Assignment

**Created:** 2026-02-16
**Updated:** 2026-02-28
**Status:** ✅ Implemented

## Overview

Agent labeling enables NGINX servers to be automatically grouped by project and environment. When an agent starts with configured labels, the gateway automatically assigns it to the matching project and environment, enabling:

- **Multi-tenancy**: Teams see only servers in their assigned projects
- **Environment grouping**: Filter servers by dev, staging, UAT, production
- **RBAC filtering**: Access control based on project/team membership

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENT AUTO-ASSIGNMENT FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. Agent Startup                                                       │
│      └── Reads labels from env vars (AVIKA_LABEL_*) or config file      │
│                                                                          │
│   2. Agent Connects to Gateway                                           │
│      └── Sends heartbeat with labels: {project, environment, team, ...} │
│                                                                          │
│   3. Gateway Receives Heartbeat                                          │
│      └── Extracts "project" and "environment" labels                    │
│                                                                          │
│   4. Auto-Assignment Logic                                               │
│      ├── Look up Project by slug (label value)                          │
│      │   └── Not found? Skip assignment                                 │
│      ├── Look up Environment by project + slug                          │
│      │   └── Not found? Skip assignment                                 │
│      ├── Check if agent already assigned                                │
│      │   └── Already assigned? Skip                                     │
│      └── Assign agent to environment                                    │
│                                                                          │
│   5. UI Reflects Assignment                                              │
│      └── Agent appears under Project → Environment in inventory         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Label Configuration

### Environment Variables (Recommended for Kubernetes)

```bash
# Required for auto-assignment
export AVIKA_LABEL_PROJECT=project-alpha     # Must match project slug
export AVIKA_LABEL_ENVIRONMENT=dev           # Must match environment slug

# Optional metadata labels
export AVIKA_LABEL_TEAM=platform
export AVIKA_LABEL_REGION=us-east-1
export AVIKA_LABEL_DATACENTER=dc1
```

### Configuration File

Edit `/etc/avika/avika-agent.conf`:

```ini
# Labels for auto-assignment
LABEL_PROJECT=project-alpha
LABEL_ENVIRONMENT=production
LABEL_TEAM=platform
LABEL_REGION=ap-south-1
```

### Important: Label Values Must Match Slugs

The `PROJECT` label must match an existing **project slug**, and the `ENVIRONMENT` label must match an **environment slug** within that project:

| Label Key | Label Value | Must Match |
|-----------|-------------|------------|
| `PROJECT` | `project-alpha` | Project slug in database |
| `ENVIRONMENT` | `dev` | Environment slug within the project |

**Example Project/Environment Setup:**

```
Project Alpha (slug: project-alpha)
├── Development (slug: dev)
├── Staging (slug: stage)
├── UAT (slug: uat)
└── Production (slug: production)

Project Beta (slug: project-beta)
├── Development (slug: dev)
├── Staging (slug: stage)
└── UAT (slug: uat)
```

---

## Kubernetes Deployment Example

### Single Agent Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-alpha-dev
  namespace: avika
  labels:
    app: nginx-sidecar
    project: alpha
    environment: dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-sidecar
      project: alpha
      environment: dev
  template:
    metadata:
      labels:
        app: nginx-sidecar
        project: alpha
        environment: dev
    spec:
      containers:
      - name: nginx
        image: nginx:1.28
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d
      
      - name: avika-agent
        image: hellodk/avika-agent:0.1.93
        env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: AVIKA_LABEL_PROJECT
          value: "project-alpha"        # Must match project slug
        - name: AVIKA_LABEL_ENVIRONMENT
          value: "dev"                  # Must match environment slug
        - name: AVIKA_LABEL_TEAM
          value: "platform"
        ports:
        - containerPort: 5026
          name: health
        livenessProbe:
          httpGet:
            path: /health
            port: 5026
          initialDelaySeconds: 5
          periodSeconds: 10
      
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config
```

### Multi-Environment Deployment Script

```bash
#!/bin/bash
# Deploy agents for multiple projects and environments

PROJECTS=("project-alpha" "project-beta")
ENVIRONMENTS=("dev" "stage" "uat")
TEAMS=("platform" "engineering")

for i in "${!PROJECTS[@]}"; do
  PROJECT="${PROJECTS[$i]}"
  TEAM="${TEAMS[$i]}"
  PROJECT_SHORT=$(echo $PROJECT | sed 's/project-//')
  
  for ENV in "${ENVIRONMENTS[@]}"; do
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-${PROJECT_SHORT}-${ENV}
  namespace: avika
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-sidecar
      project: ${PROJECT_SHORT}
      environment: ${ENV}
  template:
    metadata:
      labels:
        app: nginx-sidecar
        project: ${PROJECT_SHORT}
        environment: ${ENV}
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
          value: "${PROJECT}"
        - name: AVIKA_LABEL_ENVIRONMENT
          value: "${ENV}"
        - name: AVIKA_LABEL_TEAM
          value: "${TEAM}"
EOF
  done
done
```

---

## Creating Projects and Environments

Before agents can auto-assign, the projects and environments must exist:

### Via API

```bash
# 1. Login to get session
curl -c cookies.txt -X POST "http://gateway:5021/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 2. Create Project Alpha
curl -b cookies.txt -X POST "http://gateway:5021/api/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Project Alpha",
    "slug": "project-alpha",
    "description": "Platform team services"
  }'

# 3. Get project ID from response, then create environments
PROJECT_ID="<uuid-from-response>"

# Create dev environment
curl -b cookies.txt -X POST "http://gateway:5021/api/projects/${PROJECT_ID}/environments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Development","slug":"dev","color":"#22c55e"}'

# Create stage environment
curl -b cookies.txt -X POST "http://gateway:5021/api/projects/${PROJECT_ID}/environments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Staging","slug":"stage","color":"#f59e0b"}'

# Create UAT environment
curl -b cookies.txt -X POST "http://gateway:5021/api/projects/${PROJECT_ID}/environments" \
  -H "Content-Type: application/json" \
  -d '{"name":"UAT","slug":"uat","color":"#8b5cf6"}'

# Create production environment
curl -b cookies.txt -X POST "http://gateway:5021/api/projects/${PROJECT_ID}/environments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production","slug":"production","color":"#ef4444","is_production":true}'
```

### Via UI

1. Navigate to **Settings** → **Projects**
2. Click **Create Project**
3. Fill in name, slug, and description
4. Click **Create**
5. Click on the project to manage environments
6. Add environments with matching slugs

---

## Verifying Auto-Assignment

### Check Gateway Logs

```bash
kubectl logs deploy/avika-gateway -n avika -c gateway | grep -i "auto-assign"
```

Successful assignment:
```
Auto-assigned agent nginx-alpha-dev-xyz to project 'Project Alpha', environment 'Development'
```

Common errors:
```
Auto-assign: project 'alpha' not found for agent nginx-alpha-dev-xyz
# Fix: Use full project slug 'project-alpha' instead of 'alpha'

Auto-assign: environment 'development' not found in project 'project-alpha' for agent xyz
# Fix: Use environment slug 'dev' instead of 'development'
```

### Check Server Assignments via API

```bash
curl -b cookies.txt "http://gateway:5021/api/server-assignments" | jq '.assignments'
```

### Check in UI

1. Select project from dropdown in header
2. Click environment tab (Development, Staging, etc.)
3. View assigned agents in inventory

---

## Standard Label Keys

| Label Key | Env Var | Description | Example Values |
|-----------|---------|-------------|----------------|
| `PROJECT` | `AVIKA_LABEL_PROJECT` | Project slug for auto-assignment | `project-alpha`, `project-beta` |
| `ENVIRONMENT` | `AVIKA_LABEL_ENVIRONMENT` | Environment slug | `dev`, `stage`, `uat`, `production` |
| `TEAM` | `AVIKA_LABEL_TEAM` | Team identifier | `platform`, `engineering` |
| `REGION` | `AVIKA_LABEL_REGION` | Geographic region | `us-east-1`, `ap-south-1` |
| `DATACENTER` | `AVIKA_LABEL_DATACENTER` | Datacenter ID | `dc1`, `dc2`, `cloud` |
| `CLUSTER` | `AVIKA_LABEL_CLUSTER` | K8s cluster name | `prod-cluster` |
| `TIER` | `AVIKA_LABEL_TIER` | Service tier | `frontend`, `backend`, `cache` |

---

## Troubleshooting

### Agent Not Auto-Assigning

1. **Check agent labels are being sent:**
   ```bash
   kubectl logs deploy/nginx-alpha-dev -n avika -c avika-agent | grep -i label
   ```
   Should show: `Agent labels configured: map[environment:dev project:project-alpha team:platform]`

2. **Verify project exists with correct slug:**
   ```bash
   curl -b cookies.txt "http://gateway:5021/api/projects" | jq '.[].slug'
   ```

3. **Verify environment exists with correct slug:**
   ```bash
   curl -b cookies.txt "http://gateway:5021/api/projects/{project_id}/environments" | jq '.[].slug'
   ```

4. **Check gateway logs for errors:**
   ```bash
   kubectl logs deploy/avika-gateway -n avika | grep -i "auto-assign"
   ```

### Label Value Mismatch

**Wrong:**
```yaml
env:
- name: AVIKA_LABEL_PROJECT
  value: "alpha"              # Project slug is 'project-alpha', not 'alpha'
- name: AVIKA_LABEL_ENVIRONMENT
  value: "development"        # Environment slug is 'dev', not 'development'
```

**Correct:**
```yaml
env:
- name: AVIKA_LABEL_PROJECT
  value: "project-alpha"      # Exact project slug
- name: AVIKA_LABEL_ENVIRONMENT
  value: "dev"                # Exact environment slug
```

### Agent Shows in Wrong Environment

1. Check current assignment:
   ```bash
   curl -b cookies.txt "http://gateway:5021/api/server-assignments" | jq '.assignments[] | select(.agent_id=="<agent-id>")'
   ```

2. Unassign and let it re-assign:
   ```bash
   curl -b cookies.txt -X DELETE "http://gateway:5021/api/servers/<agent-id>/assign"
   ```

3. Restart agent to trigger re-assignment

---

## Implementation Details

### Proto Message

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

### Gateway Auto-Assignment Code Path

1. `cmd/gateway/main.go:Connect()` - Receives heartbeat
2. Checks `hb.Labels` for `project` and `environment` keys
3. Calls `autoAssignAgentToEnvironment()` for new connections
4. Calls `GetServerAssignment()` to check if already assigned
5. Calls `AssignServer()` to create assignment

### Database Tables

```sql
-- Server assignments table
CREATE TABLE server_assignments (
    agent_id TEXT PRIMARY KEY,
    environment_id UUID REFERENCES environments(id),
    display_name VARCHAR(100),
    tags TEXT[],
    assigned_by VARCHAR(100),
    assigned_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## Files Modified

| File | Change |
|------|--------|
| `api/proto/agent.proto` | Added `labels` map to Heartbeat message |
| `cmd/agent/main.go` | Read AVIKA_LABEL_* env vars and send in heartbeat |
| `cmd/gateway/main.go` | Auto-assign logic in Connect handler |
| `cmd/gateway/rbac.go` | AssignServer, GetServerAssignment functions |
| `docs/AGENT_CONFIGURATION.md` | Label configuration documentation |
