# Technical Specification: Agent Grouping, Drift Detection & Configuration Management

**Version**: 1.0  
**Status**: Draft  
**Created**: 2026-03-02  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Agent Grouping System](#2-agent-grouping-system)
3. [Drift Detection System](#3-drift-detection-system)
4. [Batch Configuration Management](#4-batch-configuration-management)
5. [Maintenance Page System](#5-maintenance-page-system)
6. [Certificate Management](#6-certificate-management)
7. [Environment Delta Comparison](#7-environment-delta-comparison)
8. [Site/Location Configuration](#8-sitelocation-configuration)
9. [API Specifications](#9-api-specifications)
10. [Database Schema](#10-database-schema)
11. [Proto Definitions](#11-proto-definitions)
12. [Frontend Components](#12-frontend-components)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Overview

### 1.1 Purpose

This specification defines the technical design for:
- Grouping NGINX agents by project, environment, and operational groups
- Detecting configuration drift between agents in the same group
- Batch configuration updates across groups
- Maintenance page management at multiple scopes
- Certificate management and deployment
- Cross-environment configuration comparison

### 1.2 Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│                      Gateway (Go gRPC Server)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ PostgreSQL  │  │ ClickHouse  │  │ Agent Session Manager   │  │
│  │ (metadata)  │  │ (metrics)   │  │ (gRPC bi-directional)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Agents (Go, runs alongside NGINX)             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Agent 1 │  │ Agent 2 │  │ Agent 3 │  │ Agent N │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Target Hierarchy

```
Project (e.g., "E-Commerce Platform")
├── Environment: Production
│   ├── Group: US-East-Web (drift detection within this group)
│   │   ├── nginx-web-01 ─┐
│   │   ├── nginx-web-02 ─┼── Should have identical configs
│   │   └── nginx-web-03 ─┘
│   ├── Group: US-West-Web
│   │   ├── nginx-web-04
│   │   └── nginx-web-05
│   └── Group: API-Gateways
│       ├── nginx-api-01
│       └── nginx-api-02
├── Environment: Staging
│   └── Group: Staging-All
│       ├── nginx-staging-01
│       └── nginx-staging-02
└── Environment: Development
    └── (ungrouped agents)
```

---

## 2. Agent Grouping System

### 2.1 Concept

Agent Groups provide operational grouping within an environment. Agents in the same group are expected to have **identical configurations** and serve the same purpose (e.g., web tier, API tier, cache tier).

### 2.2 Group Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | UUID | Auto | Unique identifier |
| `environment_id` | UUID | Yes | Parent environment |
| `name` | String | Yes | Human-readable name |
| `slug` | String | Yes | URL-safe identifier |
| `description` | String | No | Purpose/notes |
| `expected_config_hash` | String | No | Expected nginx.conf hash for drift baseline |
| `drift_check_enabled` | Boolean | Yes | Enable automatic drift detection |
| `drift_check_interval` | Integer | No | Seconds between drift checks (default: 300) |
| `metadata` | JSONB | No | Custom key-value data |

### 2.3 Group Assignment Rules

1. **Single Group**: An agent can belong to only ONE group at a time
2. **Environment Scope**: Groups exist within a single environment
3. **Optional Membership**: Agents can exist in an environment without a group
4. **Auto-Assignment**: Agents can auto-assign via labels: `LABEL_group=us-east-web`

### 2.4 Group Operations

| Operation | Scope | Description |
|-----------|-------|-------------|
| Create Group | Environment | Create new operational group |
| Delete Group | Group | Remove group (agents become ungrouped) |
| Add Agent | Group | Assign agent to group |
| Remove Agent | Group | Remove agent from group (stays in environment) |
| Move Agent | Group → Group | Transfer agent between groups |
| Bulk Assign | Group | Assign multiple agents at once |

---

## 3. Drift Detection System

### 3.1 Overview

Drift detection identifies configuration differences between:
1. **Intra-Group**: Agents within the same group (primary use case)
2. **Cross-Group**: Groups within the same environment
3. **Cross-Environment**: Same logical config across environments

### 3.2 Drift Detection Scopes

#### 3.2.1 Intra-Group Drift (Primary)

**Purpose**: Ensure all agents in a group have identical configurations.

**Baseline Selection**:
1. **Automatic**: Use the most common configuration hash as baseline
2. **Manual**: Administrator designates a "golden" agent as baseline
3. **Template**: Compare against a stored configuration template

**Detection Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│                    Drift Detection Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Trigger (scheduled or manual)                           │
│         │                                                    │
│         ▼                                                    │
│  2. Collect config hashes from all agents in group          │
│         │                                                    │
│         ▼                                                    │
│  3. Determine baseline:                                      │
│     ├─ If golden agent set → use golden agent hash          │
│     ├─ If template set → use template hash                  │
│     └─ Otherwise → use most common hash (majority vote)     │
│         │                                                    │
│         ▼                                                    │
│  4. Compare each agent hash against baseline                │
│         │                                                    │
│         ▼                                                    │
│  5. For drifted agents:                                     │
│     ├─ Fetch full config content                            │
│     ├─ Generate unified diff                                │
│     └─ Store drift report                                   │
│         │                                                    │
│         ▼                                                    │
│  6. Notify (webhook, UI alert, email)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Cross-Group Drift

**Purpose**: Compare configurations between groups (e.g., US-East vs US-West should be similar but may have regional differences).

**Use Cases**:
- Verify regional groups have consistent base configuration
- Identify intentional vs unintentional differences

#### 3.2.3 Cross-Environment Drift

**Purpose**: Compare configurations across environments for troubleshooting.

**Use Cases**:
- "Why does staging work but production doesn't?"
- Verify staging matches production before deployment

### 3.3 Drift Check Types

| Type | Description | Hash Computation |
|------|-------------|------------------|
| `nginx_main_conf` | Main nginx.conf file | SHA256 of file content |
| `nginx_site_configs` | Individual site configs in sites-enabled | SHA256 per file |
| `nginx_includes` | Included config files | SHA256 per file |
| `ssl_certificates` | SSL cert content and expiry | SHA256 of cert + expiry timestamp |
| `maintenance_page` | Maintenance page HTML/assets | SHA256 of rendered page |
| `upstream_configs` | Upstream server definitions | SHA256 of upstream blocks |

### 3.4 Drift Severity Levels

| Level | Description | Example |
|-------|-------------|---------|
| `critical` | Security or availability impact | SSL cert mismatch, missing server block |
| `warning` | Potential issue | Different buffer sizes, timeout values |
| `info` | Cosmetic difference | Comment changes, whitespace |

### 3.5 Agent-Side Hash Collection

The agent collects and reports configuration hashes in each heartbeat:

```go
type ConfigHashes struct {
    // Main nginx.conf
    MainConfHash     string    `json:"main_conf_hash"`
    MainConfModified time.Time `json:"main_conf_modified"`
    
    // Site configurations
    SiteConfigs []FileHash `json:"site_configs"`
    
    // Include files
    IncludeFiles []FileHash `json:"include_files"`
    
    // SSL certificates
    Certificates []CertHash `json:"certificates"`
    
    // Maintenance page (if exists)
    MaintenancePageHash string `json:"maintenance_page_hash,omitempty"`
    
    // Computed at
    ComputedAt time.Time `json:"computed_at"`
}

type FileHash struct {
    Path       string    `json:"path"`
    Hash       string    `json:"hash"`
    Size       int64     `json:"size"`
    ModifiedAt time.Time `json:"modified_at"`
}

type CertHash struct {
    Domain          string    `json:"domain"`
    CertPath        string    `json:"cert_path"`
    CertHash        string    `json:"cert_hash"`
    ExpiryTimestamp int64     `json:"expiry_timestamp"`
    Issuer          string    `json:"issuer"`
}
```

### 3.6 Drift Report Structure

```go
type DriftReport struct {
    ID              string        `json:"id"`
    Scope           string        `json:"scope"` // "group", "environment", "cross-environment"
    ScopeID         string        `json:"scope_id"`
    CheckType       string        `json:"check_type"` // "nginx_main_conf", "ssl_certificates", etc.
    BaselineType    string        `json:"baseline_type"` // "golden_agent", "majority", "template"
    BaselineAgentID string        `json:"baseline_agent_id,omitempty"`
    BaselineHash    string        `json:"baseline_hash"`
    TotalAgents     int           `json:"total_agents"`
    InSyncCount     int           `json:"in_sync_count"`
    DriftedCount    int           `json:"drifted_count"`
    ErrorCount      int           `json:"error_count"`
    Items           []DriftItem   `json:"items"`
    CreatedAt       time.Time     `json:"created_at"`
    ExpiresAt       time.Time     `json:"expires_at"` // Auto-cleanup
}

type DriftItem struct {
    AgentID      string `json:"agent_id"`
    Hostname     string `json:"hostname"`
    Status       string `json:"status"` // "in_sync", "drifted", "missing", "error"
    CurrentHash  string `json:"current_hash"`
    Severity     string `json:"severity"` // "critical", "warning", "info"
    DiffSummary  string `json:"diff_summary"` // Human-readable: "+3 lines, -1 line"
    DiffContent  string `json:"diff_content,omitempty"` // Unified diff
    ErrorMessage string `json:"error_message,omitempty"`
}
```

### 3.7 Drift Resolution Actions

| Action | Description |
|--------|-------------|
| `sync_to_baseline` | Push baseline config to drifted agents |
| `sync_to_agent` | Use specific agent's config as new baseline |
| `acknowledge` | Mark drift as expected/intentional |
| `create_override` | Create agent-specific override for intentional difference |

### 3.8 Automatic Drift Detection

**Scheduled Checks**:
- Per-group configurable interval (default: 5 minutes)
- Staggered to avoid thundering herd
- Skipped if group has < 2 agents

**Event-Triggered Checks**:
- After batch config update completes
- When new agent joins group
- When agent reconnects after being offline

---

## 4. Batch Configuration Management

### 4.1 Overview

Batch configuration management allows updating multiple agents simultaneously with safety controls.

### 4.2 Update Strategies

#### 4.2.1 Parallel Strategy

```
┌─────────────────────────────────────────────────────────┐
│  Parallel Update: All agents updated simultaneously     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Time ──────────────────────────────────────────────►   │
│                                                         │
│  Agent 1: [====UPDATE====]                              │
│  Agent 2: [====UPDATE====]                              │
│  Agent 3: [====UPDATE====]                              │
│  Agent 4: [====UPDATE====]                              │
│                                                         │
│  Pros: Fastest                                          │
│  Cons: All-or-nothing, risky for production            │
│  Use: Development, testing, small groups               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 4.2.2 Rolling Strategy

```
┌─────────────────────────────────────────────────────────┐
│  Rolling Update: Sequential batches with validation     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Time ──────────────────────────────────────────────►   │
│                                                         │
│  Batch 1 (Agent 1,2): [==UPDATE==][VALIDATE]            │
│                                    │                    │
│                                    ▼ OK                 │
│  Batch 2 (Agent 3,4):              [==UPDATE==][VALID]  │
│                                                │        │
│                                                ▼ OK     │
│  Batch 3 (Agent 5,6):                          [==UPD]  │
│                                                         │
│  Config:                                                │
│    batch_size: 2                                        │
│    pause_between_batches: 30s                           │
│    validation_timeout: 60s                              │
│    rollback_on_failure: true                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 4.2.3 Canary Strategy

```
┌─────────────────────────────────────────────────────────┐
│  Canary Update: Test on subset before full rollout      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Time ──────────────────────────────────────────────►   │
│                                                         │
│  Phase 1 - Canary (10%):                                │
│    Agent 1: [==UPDATE==][====MONITOR 5min====]          │
│                                        │                │
│                                        ▼ Metrics OK     │
│  Phase 2 - Expansion (50%):                             │
│    Agent 2,3: [==UPDATE==][====MONITOR 5min====]        │
│                                            │            │
│                                            ▼ OK         │
│  Phase 3 - Full rollout:                                │
│    Agent 4,5,6: [==UPDATE==]                            │
│                                                         │
│  Config:                                                │
│    canary_percentage: 10                                │
│    canary_duration: 300s                                │
│    expansion_percentage: 50                             │
│    success_criteria:                                    │
│      - error_rate < 1%                                  │
│      - latency_p99 < 500ms                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Configuration Templates

Templates allow defining reusable configurations with variable substitution.

#### 4.3.1 Template Structure

```go
type ConfigTemplate struct {
    ID            string            `json:"id"`
    ProjectID     string            `json:"project_id,omitempty"` // Project-wide template
    EnvironmentID string            `json:"environment_id,omitempty"` // Environment-specific
    GroupID       string            `json:"group_id,omitempty"` // Group-specific
    Name          string            `json:"name"`
    TemplateType  string            `json:"template_type"` // See types below
    Content       string            `json:"content"` // Template with {{variables}}
    Variables     []TemplateVar     `json:"variables"`
    Defaults      map[string]string `json:"defaults"`
    Version       int               `json:"version"`
    IsActive      bool              `json:"is_active"`
    CreatedBy     string            `json:"created_by"`
    CreatedAt     time.Time         `json:"created_at"`
    UpdatedAt     time.Time         `json:"updated_at"`
}

type TemplateVar struct {
    Name        string   `json:"name"`
    Description string   `json:"description"`
    Required    bool     `json:"required"`
    Default     string   `json:"default,omitempty"`
    Validation  string   `json:"validation,omitempty"` // Regex pattern
    Options     []string `json:"options,omitempty"` // For enum types
}
```

#### 4.3.2 Template Types

| Type | Description | Scope |
|------|-------------|-------|
| `nginx_main_conf` | Full nginx.conf | Agent |
| `server_block` | Single server block | Site |
| `location_block` | Location directive | Location |
| `upstream_block` | Upstream definition | Backend |
| `ssl_params` | SSL/TLS parameters | Server |
| `rate_limit` | Rate limiting config | Location |
| `maintenance_page` | Maintenance HTML | Site/Group |

#### 4.3.3 Template Example

```nginx
# Template: server_block
# Variables: server_name, upstream_name, ssl_cert_path, ssl_key_path

server {
    listen 443 ssl http2;
    server_name {{server_name}};
    
    ssl_certificate {{ssl_cert_path}};
    ssl_certificate_key {{ssl_key_path}};
    
    {{#if rate_limit_enabled}}
    limit_req zone=api_limit burst={{rate_limit_burst}} nodelay;
    {{/if}}
    
    location / {
        proxy_pass http://{{upstream_name}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    {{#each custom_locations}}
    location {{this.path}} {
        {{this.directives}}
    }
    {{/each}}
}
```

### 4.4 Agent-Specific Overrides

Allow individual agents to have intentional configuration differences.

```go
type AgentConfigOverride struct {
    ID            string    `json:"id"`
    AgentID       string    `json:"agent_id"`
    OverrideType  string    `json:"override_type"` // "append", "replace", "variable"
    TargetContext string    `json:"target_context"` // "http", "server:example.com", "location:/api"
    Content       string    `json:"content"`
    Reason        string    `json:"reason"` // Documentation
    ExcludeFromDrift bool   `json:"exclude_from_drift"` // Don't flag as drift
    CreatedBy     string    `json:"created_by"`
    CreatedAt     time.Time `json:"created_at"`
    UpdatedAt     time.Time `json:"updated_at"`
}
```

### 4.5 Batch Update Request

```go
type BatchConfigUpdateRequest struct {
    // Target selection (one required)
    AgentIDs      []string `json:"agent_ids,omitempty"`
    GroupID       string   `json:"group_id,omitempty"`
    EnvironmentID string   `json:"environment_id,omitempty"`
    
    // Configuration source (one required)
    TemplateID    string            `json:"template_id,omitempty"`
    RawContent    string            `json:"raw_content,omitempty"`
    SourceAgentID string            `json:"source_agent_id,omitempty"` // Copy from agent
    
    // Variables for template
    Variables map[string]string `json:"variables,omitempty"`
    
    // Strategy
    Strategy                  string `json:"strategy"` // "parallel", "rolling", "canary"
    BatchSize                 int    `json:"batch_size,omitempty"`
    PauseBetweenBatchesSeconds int   `json:"pause_between_batches_seconds,omitempty"`
    
    // Safety
    DryRun          bool `json:"dry_run"`
    ValidateOnly    bool `json:"validate_only"`
    BackupFirst     bool `json:"backup_first"`
    RollbackOnFail  bool `json:"rollback_on_fail"`
    
    // Canary-specific
    CanaryPercentage   int      `json:"canary_percentage,omitempty"`
    CanaryDuration     int      `json:"canary_duration_seconds,omitempty"`
    SuccessCriteria    []string `json:"success_criteria,omitempty"`
    
    // Metadata
    Description string `json:"description"`
    RequestedBy string `json:"requested_by"`
}
```

### 4.6 Batch Update Response

```go
type BatchConfigUpdateResponse struct {
    BatchID     string              `json:"batch_id"`
    Status      string              `json:"status"` // "pending", "in_progress", "completed", "partial_failure", "failed", "rolled_back"
    Strategy    string              `json:"strategy"`
    TotalAgents int                 `json:"total_agents"`
    Progress    BatchProgress       `json:"progress"`
    Results     []AgentUpdateResult `json:"results"`
    StartedAt   time.Time           `json:"started_at"`
    CompletedAt *time.Time          `json:"completed_at,omitempty"`
    Error       string              `json:"error,omitempty"`
}

type BatchProgress struct {
    CurrentBatch int `json:"current_batch"`
    TotalBatches int `json:"total_batches"`
    Completed    int `json:"completed"`
    Failed       int `json:"failed"`
    Pending      int `json:"pending"`
}

type AgentUpdateResult struct {
    AgentID      string     `json:"agent_id"`
    Hostname     string     `json:"hostname"`
    Status       string     `json:"status"` // "success", "failed", "skipped", "rolled_back"
    BackupPath   string     `json:"backup_path,omitempty"`
    ConfigHash   string     `json:"config_hash,omitempty"`
    Error        string     `json:"error,omitempty"`
    Duration     int        `json:"duration_ms"`
    CompletedAt  *time.Time `json:"completed_at,omitempty"`
}
```

---

## 5. Maintenance Page System

### 5.1 Overview

Maintenance mode redirects traffic to a customizable maintenance page at various scopes. Users can:
- **Upload custom maintenance pages** with HTML, CSS, and assets (images, fonts)
- **Select which page to display** from a library of templates
- **Schedule maintenance periods** with automatic start and end times
- **Preview pages** before deployment

### 5.2 Maintenance Scopes

| Scope | Description | NGINX Implementation |
|-------|-------------|---------------------|
| `agent` | Single NGINX instance | Global return 503 |
| `group` | All agents in a group | Applied to all group members |
| `environment` | All agents in environment | Applied to all environment agents |
| `project` | All agents in project | Applied to all project agents |
| `site` | Specific server_name | Server block return 503 |
| `location` | Specific location path | Location block return 503 |

### 5.3 Custom Maintenance Page Upload

#### 5.3.1 Upload Methods

1. **Rich Text Editor**: In-browser WYSIWYG editor for simple pages
2. **HTML Upload**: Upload complete HTML file with inline styles
3. **ZIP Package**: Upload ZIP containing HTML, CSS, and assets
4. **Git Repository**: Pull template from Git repo URL

#### 5.3.2 Supported Assets

| Asset Type | Extensions | Max Size | Storage |
|------------|------------|----------|---------|
| Images | .png, .jpg, .gif, .svg, .webp | 2MB each | Base64 in JSONB |
| Stylesheets | .css | 500KB | Text column |
| Fonts | .woff, .woff2, .ttf | 1MB each | Base64 in JSONB |
| JavaScript | .js | 200KB | Text in assets JSONB |

#### 5.3.3 Template Variables

Templates support variable substitution for dynamic content:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{company_name}}` | Organization name | "Acme Corp" |
| `{{support_email}}` | Support contact | "support@acme.com" |
| `{{support_phone}}` | Phone number | "+1-800-123-4567" |
| `{{estimated_end}}` | Scheduled end time | "March 2, 2026 6:00 PM UTC" |
| `{{reason}}` | Maintenance reason | "Scheduled database upgrade" |
| `{{progress_percent}}` | Optional progress | "45%" |
| `{{custom.*}}` | User-defined variables | Any custom value |

### 5.5 Maintenance Template Structure

```go
type MaintenanceTemplate struct {
    ID          string            `json:"id"`
    ProjectID   string            `json:"project_id"`
    Name        string            `json:"name"`
    Description string            `json:"description"`
    HTMLContent string            `json:"html_content"`
    CSSContent  string            `json:"css_content,omitempty"`
    Assets      map[string]string `json:"assets"` // filename -> base64 content
    Variables   []TemplateVar     `json:"variables"`
    PreviewURL  string            `json:"preview_url,omitempty"` // Generated preview
    IsDefault   bool              `json:"is_default"`
    IsBuiltIn   bool              `json:"is_built_in"` // System-provided templates
    CreatedBy   string            `json:"created_by"`
    CreatedAt   time.Time         `json:"created_at"`
    UpdatedAt   time.Time         `json:"updated_at"`
}
```

#### 5.5.1 Built-in Templates

The system provides several built-in templates:

| Template | Description | Use Case |
|----------|-------------|----------|
| `minimal` | Simple text-only page | Quick maintenance |
| `corporate` | Professional with logo placeholder | Business sites |
| `countdown` | Shows countdown to scheduled end | Planned maintenance |
| `progress` | Progress bar with status updates | Long maintenance |
| `custom-message` | Large message area | Emergency notices |

### 5.6 Maintenance Scheduling

#### 5.6.1 Schedule Types

| Type | Description | Behavior |
|------|-------------|----------|
| `immediate` | Start now, no end time | Manual disable required |
| `immediate_scheduled_end` | Start now, auto-disable at end time | Auto-disables |
| `scheduled` | Start and end at specific times | Fully automatic |
| `recurring` | Repeating schedule (cron-like) | Auto-enables/disables |

#### 5.6.2 Maintenance State

```go
type MaintenanceState struct {
    ID              string    `json:"id"`
    Scope           string    `json:"scope"`
    ScopeID         string    `json:"scope_id"`
    SiteFilter      string    `json:"site_filter,omitempty"`
    LocationFilter  string    `json:"location_filter,omitempty"`
    
    // Template selection
    TemplateID      string    `json:"template_id"`
    TemplateVars    map[string]string `json:"template_vars"` // Variable values
    
    // Current state
    IsEnabled       bool      `json:"is_enabled"`
    EnabledAt       *time.Time `json:"enabled_at,omitempty"`
    EnabledBy       string    `json:"enabled_by,omitempty"`
    
    // Scheduling
    ScheduleType    string    `json:"schedule_type"` // "immediate", "scheduled", "recurring"
    ScheduledStart  *time.Time `json:"scheduled_start,omitempty"`
    ScheduledEnd    *time.Time `json:"scheduled_end,omitempty"`
    RecurrenceRule  string    `json:"recurrence_rule,omitempty"` // Cron expression
    
    // Bypass rules
    BypassIPs       []string  `json:"bypass_ips"`
    BypassHeaders   map[string]string `json:"bypass_headers"`
    BypassCookies   map[string]string `json:"bypass_cookies"`
    
    // Metadata
    Reason          string    `json:"reason,omitempty"`
    NotifyOnStart   bool      `json:"notify_on_start"`
    NotifyOnEnd     bool      `json:"notify_on_end"`
    NotifyChannels  []string  `json:"notify_channels"` // "email", "slack", "webhook"
}
```

### 5.5 NGINX Maintenance Implementation

#### 5.5.1 Global Maintenance (Agent/Group/Environment Level)

```nginx
# Injected at http block level
map $remote_addr $maintenance_bypass {
    default 0;
    10.0.0.1 1;      # Admin IP
    192.168.1.0/24 1; # Internal network
}

map $http_x_bypass_maintenance $header_bypass {
    default 0;
    "secret-token" 1;
}

set $bypass_maintenance 0;
if ($maintenance_bypass = 1) {
    set $bypass_maintenance 1;
}
if ($header_bypass = 1) {
    set $bypass_maintenance 1;
}

# In server block
if ($bypass_maintenance = 0) {
    return 503;
}

error_page 503 @maintenance;
location @maintenance {
    root /etc/nginx/maintenance;
    try_files /index.html =503;
    internal;
}
```

#### 5.5.2 Site-Level Maintenance

```nginx
server {
    server_name api.example.com;
    
    # Site-specific maintenance
    set $site_maintenance 1;
    
    if ($bypass_maintenance = 0) {
        if ($site_maintenance = 1) {
            return 503;
        }
    }
    
    # ... rest of config
}
```

#### 5.5.3 Location-Level Maintenance

```nginx
location /api/v2 {
    # Location-specific maintenance
    if ($bypass_maintenance = 0) {
        return 503;
    }
    
    proxy_pass http://backend;
}
```

### 5.6 Maintenance File Deployment

When maintenance mode is enabled:

1. **Render template** with variables
2. **Deploy files** to agent:
   ```
   /etc/nginx/maintenance/
   ├── index.html
   ├── style.css
   └── assets/
       ├── logo.png
       └── background.jpg
   ```
3. **Inject NGINX config** snippet
4. **Reload NGINX**
5. **Store state** in database

### 5.7 Maintenance Request

```go
type MaintenanceRequest struct {
    // Action
    Action         string            `json:"action"` // "enable", "disable", "schedule", "cancel_schedule"
    
    // Scope
    Scope          string            `json:"scope"`
    ScopeID        string            `json:"scope_id"`
    SiteFilter     string            `json:"site_filter,omitempty"`
    LocationFilter string            `json:"location_filter,omitempty"`
    
    // Template selection
    TemplateID     string            `json:"template_id,omitempty"`
    Variables      map[string]string `json:"variables,omitempty"`
    
    // Scheduling
    ScheduleType   string            `json:"schedule_type"` // "immediate", "scheduled", "recurring"
    ScheduledStart *time.Time        `json:"scheduled_start,omitempty"`
    ScheduledEnd   *time.Time        `json:"scheduled_end,omitempty"`
    RecurrenceRule string            `json:"recurrence_rule,omitempty"` // "0 2 * * 0" (every Sunday 2am)
    Timezone       string            `json:"timezone,omitempty"` // "America/New_York"
    
    // Bypass rules
    BypassIPs      []string          `json:"bypass_ips,omitempty"`
    BypassHeaders  map[string]string `json:"bypass_headers,omitempty"`
    BypassCookies  map[string]string `json:"bypass_cookies,omitempty"`
    
    // Notifications
    NotifyOnStart  bool              `json:"notify_on_start"`
    NotifyOnEnd    bool              `json:"notify_on_end"`
    NotifyChannels []string          `json:"notify_channels,omitempty"`
    
    // Metadata
    Reason         string            `json:"reason,omitempty"`
    RequestedBy    string            `json:"requested_by"`
}
```

### 5.8 Maintenance Page Selection Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  Enable Maintenance Mode                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Select Scope                                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ○ Single Agent    ○ Group    ● Environment    ○ Project   │  │
│  │ ○ Specific Site   ○ Specific Location                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 2: Choose Maintenance Page                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │  │ Minimal │  │Corporate│  │Countdown│  │ Custom  │      │  │
│  │  │  ┌───┐  │  │  ┌───┐  │  │  ┌───┐  │  │  ┌───┐  │      │  │
│  │  │  │   │  │  │  │🏢 │  │  │  │⏱️ │  │  │  │ + │  │      │  │
│  │  │  └───┘  │  │  └───┘  │  │  └───┘  │  │  └───┘  │      │  │
│  │  │  [●]    │  │  [ ]    │  │  [ ]    │  │ Upload  │      │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │  │
│  │                                                           │  │
│  │  [Preview Selected Template]                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 3: Configure Variables (if template has variables)        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Company Name:    [Acme Corporation                    ]  │  │
│  │  Support Email:   [support@acme.com                    ]  │  │
│  │  Custom Message:  [We're upgrading our systems...      ]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 4: Schedule                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ● Start immediately                                      │  │
│  │  ○ Schedule for later                                     │  │
│  │                                                           │  │
│  │  Auto-disable: ☑ Yes                                     │  │
│  │  End time:     [2026-03-02]  [18:00]  [UTC        ▼]     │  │
│  │                                                           │  │
│  │  ○ Recurring schedule                                     │  │
│  │     Pattern: [Every Sunday 2:00 AM - 4:00 AM         ▼]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 5: Bypass Rules (Optional)                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Allow these IPs to bypass:                               │  │
│  │  [10.0.0.1, 192.168.1.0/24                            ]  │  │
│  │                                                           │  │
│  │  Bypass header: [X-Bypass-Maintenance] = [secret123  ]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Cancel]  [Preview]              [Enable Maintenance Mode]     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.9 Scheduled Maintenance Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│  Scheduled Maintenance Timeline                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Current Time: 2026-03-02 10:00 UTC                             │
│                                                                  │
│  ──●────────────────●═══════════════════●────────────────●──    │
│    │                │                   │                │       │
│  10:00           14:00              18:00            22:00       │
│  (now)         (start)             (end)                        │
│                                                                  │
│  Status: ⏳ Scheduled (starts in 4 hours)                        │
│                                                                  │
│  Actions: [Start Now] [Modify Schedule] [Cancel]                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.8 Maintenance Drift Detection

Maintenance pages should also be subject to drift detection within groups:

- Compare maintenance page content hash across group members
- Alert if some agents have maintenance enabled but others don't
- Track maintenance template version deployed to each agent

---

## 6. Certificate Management

### 6.1 Overview

Certificate management handles SSL/TLS certificate lifecycle across agents.

### 6.2 Certificate Inventory

```go
type CertificateRecord struct {
    ID              string    `json:"id"`
    Domain          string    `json:"domain"`
    EnvironmentID   string    `json:"environment_id"`
    CertType        string    `json:"cert_type"` // "letsencrypt", "commercial", "self-signed"
    Issuer          string    `json:"issuer"`
    ExpiryDate      time.Time `json:"expiry_date"`
    SANDomains      []string  `json:"san_domains"`
    CertContentHash string    `json:"cert_content_hash"`
    KeyContentHash  string    `json:"key_content_hash"`
    AutoRenew       bool      `json:"auto_renew"`
    LastRenewed     time.Time `json:"last_renewed,omitempty"`
    RenewalErrors   string    `json:"renewal_errors,omitempty"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}
```

### 6.3 Certificate Deployment

```go
type CertificateDeployment struct {
    ID            string    `json:"id"`
    CertificateID string    `json:"certificate_id"`
    AgentID       string    `json:"agent_id"`
    CertPath      string    `json:"cert_path"`
    KeyPath       string    `json:"key_path"`
    DeployedAt    time.Time `json:"deployed_at"`
    DeployedBy    string    `json:"deployed_by"`
    Status        string    `json:"status"` // "deployed", "pending", "failed"
    DeployedHash  string    `json:"deployed_hash"` // For drift detection
}
```

### 6.4 Certificate Upload Request

```go
type CertificateUploadRequest struct {
    Domain      string   `json:"domain"`
    CertContent []byte   `json:"cert_content"` // PEM format
    KeyContent  []byte   `json:"key_content"`  // PEM format
    ChainContent []byte  `json:"chain_content,omitempty"` // Intermediate certs
    CertType    string   `json:"cert_type"`
    
    // Target selection
    AgentIDs      []string `json:"agent_ids,omitempty"`
    GroupID       string   `json:"group_id,omitempty"`
    EnvironmentID string   `json:"environment_id,omitempty"`
    
    // Options
    BackupExisting bool   `json:"backup_existing"`
    ReloadNginx    bool   `json:"reload_nginx"`
    
    RequestedBy string `json:"requested_by"`
}
```

### 6.5 Certificate Drift Detection

Certificates are included in drift detection:

| Check | Description |
|-------|-------------|
| Content hash | Certificate file content matches across group |
| Expiry date | All agents have same cert version |
| Path consistency | Cert/key paths are consistent |
| Chain completeness | Intermediate certs present on all agents |

### 6.6 Certificate Auto-Renewal Integration

For Let's Encrypt certificates:

```go
type AutoRenewalConfig struct {
    Enabled           bool     `json:"enabled"`
    RenewalDays       int      `json:"renewal_days"` // Days before expiry to renew
    NotificationDays  []int    `json:"notification_days"` // Alert at 30, 14, 7 days
    ACMEEmail         string   `json:"acme_email"`
    ACMEServer        string   `json:"acme_server"` // production or staging
    ChallengeType     string   `json:"challenge_type"` // "http-01", "dns-01"
    DNSProvider       string   `json:"dns_provider,omitempty"`
    DNSCredentials    string   `json:"dns_credentials,omitempty"` // Encrypted
}
```

---

## 7. Environment Delta Comparison

### 7.1 Overview

Compare configurations between environments to troubleshoot issues.

### 7.2 Comparison Request

```go
type EnvironmentCompareRequest struct {
    SourceEnvironmentID string   `json:"source_environment_id"`
    TargetEnvironmentID string   `json:"target_environment_id"`
    CompareTypes        []string `json:"compare_types"` // ["nginx_conf", "ssl_certs", "maintenance"]
    IncludeDiffContent  bool     `json:"include_diff_content"`
    GroupMapping        map[string]string `json:"group_mapping,omitempty"` // source_group_id -> target_group_id
}
```

### 7.3 Comparison Response

```go
type EnvironmentCompareResponse struct {
    SourceEnvironment string               `json:"source_environment"`
    TargetEnvironment string               `json:"target_environment"`
    ComparedAt        time.Time            `json:"compared_at"`
    Categories        []ComparisonCategory `json:"categories"`
    Summary           ComparisonSummary    `json:"summary"`
}

type ComparisonCategory struct {
    Type         string             `json:"type"`
    SourceCount  int                `json:"source_count"`
    TargetCount  int                `json:"target_count"`
    SameCount    int                `json:"same_count"`
    DifferentCount int              `json:"different_count"`
    SourceOnly   int                `json:"source_only"`
    TargetOnly   int                `json:"target_only"`
    Differences  []ConfigDifference `json:"differences"`
}

type ConfigDifference struct {
    Identifier   string `json:"identifier"` // filename, domain, etc.
    Status       string `json:"status"` // "same", "different", "source_only", "target_only"
    SourceValue  string `json:"source_value,omitempty"` // Hash or summary
    TargetValue  string `json:"target_value,omitempty"`
    Diff         string `json:"diff,omitempty"` // Unified diff
    Severity     string `json:"severity"`
}

type ComparisonSummary struct {
    TotalChecks      int  `json:"total_checks"`
    IdenticalCount   int  `json:"identical_count"`
    DifferentCount   int  `json:"different_count"`
    HasCriticalDiffs bool `json:"has_critical_diffs"`
}
```

### 7.4 Comparison Use Cases

1. **Pre-deployment validation**: Compare staging to production before release
2. **Troubleshooting**: "It works in staging but not production"
3. **Compliance**: Verify all environments meet baseline config
4. **Documentation**: Generate config diff reports

---

## 8. Site/Location Configuration

### 8.1 Overview

Manage site and location configurations at various scopes.

### 8.2 Site Location Update Request

```go
type SiteLocationUpdateRequest struct {
    // Target selection
    Target   string `json:"target"` // "agent", "group", "environment"
    TargetID string `json:"target_id"`
    
    // Site identification
    ServerName string `json:"server_name"` // e.g., "api.example.com"
    
    // Location (optional - if omitted, applies to server block)
    LocationPath string `json:"location_path,omitempty"` // e.g., "/api/v2"
    
    // Action
    Action string `json:"action"` // "create", "update", "delete"
    
    // Configuration
    Config LocationConfig `json:"config,omitempty"`
    
    // Options
    DryRun         bool `json:"dry_run"`
    BackupFirst    bool `json:"backup_first"`
    ReloadNginx    bool `json:"reload_nginx"`
    
    RequestedBy string `json:"requested_by"`
}

type LocationConfig struct {
    // Proxy settings
    ProxyPass           string            `json:"proxy_pass,omitempty"`
    ProxyHeaders        map[string]string `json:"proxy_headers,omitempty"`
    ProxyConnectTimeout int               `json:"proxy_connect_timeout,omitempty"`
    ProxyReadTimeout    int               `json:"proxy_read_timeout,omitempty"`
    
    // Rate limiting
    RateLimit *RateLimitConfig `json:"rate_limit,omitempty"`
    
    // Caching
    Cache *CacheConfig `json:"cache,omitempty"`
    
    // Security
    AllowedMethods []string `json:"allowed_methods,omitempty"`
    DenyIPs        []string `json:"deny_ips,omitempty"`
    AllowIPs       []string `json:"allow_ips,omitempty"`
    
    // Custom directives
    CustomDirectives string `json:"custom_directives,omitempty"`
}

type RateLimitConfig struct {
    Zone        string `json:"zone"`
    Rate        string `json:"rate"` // e.g., "10r/s"
    Burst       int    `json:"burst"`
    NoDelay     bool   `json:"no_delay"`
}

type CacheConfig struct {
    Zone       string   `json:"zone"`
    Valid      []string `json:"valid"` // ["200 302 10m", "404 1m"]
    Methods    []string `json:"methods"` // ["GET", "HEAD"]
    Key        string   `json:"key"`
    BypassVar  string   `json:"bypass_var,omitempty"`
}
```

---

## 9. API Specifications

### 9.1 REST API Endpoints

#### 9.1.1 Groups API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/groups` | List all groups (filtered by environment) |
| POST | `/api/v1/groups` | Create new group |
| GET | `/api/v1/groups/{id}` | Get group details |
| PUT | `/api/v1/groups/{id}` | Update group |
| DELETE | `/api/v1/groups/{id}` | Delete group |
| GET | `/api/v1/groups/{id}/agents` | List agents in group |
| POST | `/api/v1/groups/{id}/agents` | Add agents to group |
| DELETE | `/api/v1/groups/{id}/agents/{agent_id}` | Remove agent from group |
| PUT | `/api/v1/groups/{id}/golden-agent` | Set golden agent for drift baseline |

#### 9.1.2 Drift API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/drift/check` | Trigger drift check |
| GET | `/api/v1/drift/reports` | List drift reports |
| GET | `/api/v1/drift/reports/{id}` | Get drift report details |
| POST | `/api/v1/drift/resolve` | Resolve drift (sync to baseline) |
| GET | `/api/v1/drift/status/{scope}/{scope_id}` | Get current drift status |

#### 9.1.3 Batch Config API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/config/batch` | Start batch config update |
| GET | `/api/v1/config/batch/{id}` | Get batch status |
| POST | `/api/v1/config/batch/{id}/cancel` | Cancel batch update |
| POST | `/api/v1/config/batch/{id}/rollback` | Rollback batch update |
| GET | `/api/v1/config/templates` | List config templates |
| POST | `/api/v1/config/templates` | Create config template |
| GET | `/api/v1/config/templates/{id}` | Get template |
| PUT | `/api/v1/config/templates/{id}` | Update template |
| DELETE | `/api/v1/config/templates/{id}` | Delete template |
| POST | `/api/v1/config/templates/{id}/render` | Preview rendered template |

#### 9.1.4 Maintenance API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/maintenance` | Enable/disable maintenance |
| GET | `/api/v1/maintenance/status` | Get maintenance status |
| GET | `/api/v1/maintenance/states` | List all maintenance states |
| GET | `/api/v1/maintenance/templates` | List maintenance templates |
| POST | `/api/v1/maintenance/templates` | Create maintenance template |
| PUT | `/api/v1/maintenance/templates/{id}` | Update maintenance template |
| DELETE | `/api/v1/maintenance/templates/{id}` | Delete maintenance template |
| POST | `/api/v1/maintenance/templates/{id}/preview` | Preview rendered template |

#### 9.1.5 Certificates API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/certificates` | List certificate inventory |
| POST | `/api/v1/certificates` | Upload new certificate |
| GET | `/api/v1/certificates/{id}` | Get certificate details |
| DELETE | `/api/v1/certificates/{id}` | Delete certificate |
| POST | `/api/v1/certificates/{id}/deploy` | Deploy cert to agents |
| POST | `/api/v1/certificates/{id}/renew` | Trigger renewal |
| GET | `/api/v1/certificates/expiring` | List expiring certificates |

#### 9.1.6 Environment Compare API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/environments/compare` | Compare two environments |
| GET | `/api/v1/environments/compare/{id}` | Get comparison result |

#### 9.1.7 Site/Location API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sites/update` | Update site/location config |
| GET | `/api/v1/sites/{server_name}` | Get site config |
| GET | `/api/v1/sites/{server_name}/locations` | List locations for site |

---

## 10. Database Schema

### 10.1 New Tables

```sql
-- ============================================
-- Agent Groups
-- ============================================
CREATE TABLE agent_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    golden_agent_id TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
    expected_config_hash VARCHAR(64),
    drift_check_enabled BOOLEAN DEFAULT true,
    drift_check_interval_seconds INTEGER DEFAULT 300,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(environment_id, slug)
);

CREATE INDEX idx_agent_groups_environment ON agent_groups(environment_id);

-- Add group_id to server_assignments
ALTER TABLE server_assignments 
ADD COLUMN group_id UUID REFERENCES agent_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_server_assignments_group ON server_assignments(group_id);

-- ============================================
-- Configuration Templates
-- ============================================
CREATE TABLE config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
    group_id UUID REFERENCES agent_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    defaults JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT config_templates_single_scope CHECK (
        (project_id IS NOT NULL)::int + 
        (environment_id IS NOT NULL)::int + 
        (group_id IS NOT NULL)::int <= 1
    )
);

CREATE INDEX idx_config_templates_project ON config_templates(project_id);
CREATE INDEX idx_config_templates_environment ON config_templates(environment_id);
CREATE INDEX idx_config_templates_group ON config_templates(group_id);

-- ============================================
-- Agent Config Assignments (template to agent)
-- ============================================
CREATE TABLE agent_config_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES config_templates(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by VARCHAR(100),
    applied_content_hash VARCHAR(64),
    status VARCHAR(50) DEFAULT 'applied',
    UNIQUE(agent_id, template_id)
);

-- ============================================
-- Agent Config Overrides
-- ============================================
CREATE TABLE agent_config_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    override_type VARCHAR(50) NOT NULL,
    target_context VARCHAR(100),
    content TEXT NOT NULL,
    reason TEXT,
    exclude_from_drift BOOLEAN DEFAULT false,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_overrides_agent ON agent_config_overrides(agent_id);

-- ============================================
-- Config Snapshots (for drift detection)
-- ============================================
CREATE TABLE config_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    snapshot_type VARCHAR(50) NOT NULL,
    file_path TEXT,
    content_hash VARCHAR(64) NOT NULL,
    content TEXT,
    file_size BIGINT,
    file_modified_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_config_snapshots_agent ON config_snapshots(agent_id);
CREATE INDEX idx_config_snapshots_type ON config_snapshots(snapshot_type);
CREATE INDEX idx_config_snapshots_captured ON config_snapshots(captured_at);

-- ============================================
-- Drift Reports
-- ============================================
CREATE TABLE drift_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    baseline_type VARCHAR(50) NOT NULL,
    baseline_agent_id TEXT,
    baseline_hash VARCHAR(64),
    total_agents INTEGER DEFAULT 0,
    in_sync_count INTEGER DEFAULT 0,
    drifted_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    items JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX idx_drift_reports_target ON drift_reports(target_id);
CREATE INDEX idx_drift_reports_created ON drift_reports(created_at);

-- ============================================
-- Batch Config Updates
-- ============================================
CREATE TABLE batch_config_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(50) DEFAULT 'pending',
    strategy VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id TEXT NOT NULL,
    template_id UUID REFERENCES config_templates(id),
    raw_content TEXT,
    variables JSONB DEFAULT '{}',
    total_agents INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    current_batch INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    results JSONB DEFAULT '[]',
    error TEXT,
    requested_by VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_batch_updates_status ON batch_config_updates(status);

-- ============================================
-- Maintenance Templates
-- ============================================
CREATE TABLE maintenance_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    html_content TEXT NOT NULL,
    css_content TEXT,
    assets JSONB DEFAULT '{}',
    variables JSONB DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_maintenance_templates_project ON maintenance_templates(project_id);

-- ============================================
-- Maintenance State
-- ============================================
CREATE TABLE maintenance_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope VARCHAR(50) NOT NULL,
    scope_id TEXT NOT NULL,
    site_filter TEXT,
    location_filter TEXT,
    template_id UUID REFERENCES maintenance_templates(id),
    is_enabled BOOLEAN DEFAULT false,
    enabled_at TIMESTAMP WITH TIME ZONE,
    enabled_by VARCHAR(100),
    scheduled_end TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    bypass_ips TEXT[] DEFAULT '{}',
    bypass_headers JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    UNIQUE(scope, scope_id, COALESCE(site_filter, ''), COALESCE(location_filter, ''))
);

CREATE INDEX idx_maintenance_state_scope ON maintenance_state(scope, scope_id);
CREATE INDEX idx_maintenance_state_enabled ON maintenance_state(is_enabled);

-- ============================================
-- Certificate Inventory
-- ============================================
CREATE TABLE certificate_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL,
    environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
    cert_type VARCHAR(50),
    issuer VARCHAR(255),
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    san_domains TEXT[] DEFAULT '{}',
    cert_content_hash VARCHAR(64),
    key_content_hash VARCHAR(64),
    auto_renew BOOLEAN DEFAULT false,
    acme_config JSONB DEFAULT '{}',
    last_renewed TIMESTAMP WITH TIME ZONE,
    renewal_errors TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_cert_inventory_domain ON certificate_inventory(domain);
CREATE INDEX idx_cert_inventory_expiry ON certificate_inventory(expiry_date);
CREATE INDEX idx_cert_inventory_environment ON certificate_inventory(environment_id);

-- ============================================
-- Certificate Deployments
-- ============================================
CREATE TABLE certificate_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificate_inventory(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    cert_path TEXT,
    key_path TEXT,
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deployed_by VARCHAR(100),
    deployed_hash VARCHAR(64),
    status VARCHAR(50) DEFAULT 'deployed',
    UNIQUE(certificate_id, agent_id)
);

CREATE INDEX idx_cert_deployments_agent ON certificate_deployments(agent_id);
CREATE INDEX idx_cert_deployments_cert ON certificate_deployments(certificate_id);

-- ============================================
-- Environment Comparisons
-- ============================================
CREATE TABLE environment_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_environment_id UUID NOT NULL REFERENCES environments(id),
    target_environment_id UUID NOT NULL REFERENCES environments(id),
    compare_types TEXT[] NOT NULL,
    result JSONB NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_env_comparisons_source ON environment_comparisons(source_environment_id);
CREATE INDEX idx_env_comparisons_target ON environment_comparisons(target_environment_id);
```

### 10.2 Migration Order

1. `007_agent_groups.sql` - Groups and server_assignments update
2. `008_config_templates.sql` - Templates and assignments
3. `009_drift_detection.sql` - Snapshots and reports
4. `010_batch_updates.sql` - Batch update tracking
5. `011_maintenance.sql` - Maintenance templates and state
6. `012_certificates.sql` - Certificate inventory and deployments
7. `013_environment_compare.sql` - Comparison results

---

## 11. Proto Definitions

### 11.1 Updated agent.proto Additions

```protobuf
// ============================================
// Config Hashes (added to Heartbeat)
// ============================================

message ConfigHashes {
    string main_conf_hash = 1;
    int64 main_conf_modified = 2;
    repeated FileHash site_configs = 3;
    repeated FileHash include_files = 4;
    repeated CertHash certificates = 5;
    string maintenance_page_hash = 6;
    int64 computed_at = 7;
}

message FileHash {
    string path = 1;
    string hash = 2;
    int64 size = 3;
    int64 modified_at = 4;
}

message CertHash {
    string domain = 1;
    string cert_path = 2;
    string cert_hash = 3;
    int64 expiry_timestamp = 4;
    string issuer = 5;
}

// Add to existing Heartbeat message:
// ConfigHashes config_hashes = 15;

// ============================================
// Drift Detection
// ============================================

message DriftCheckRequest {
    string scope = 1; // "group", "environment", "project"
    string scope_id = 2;
    repeated string check_types = 3; // ["nginx_main_conf", "ssl_certs", "maintenance_page"]
    string baseline_agent_id = 4; // Optional: use specific agent as baseline
    bool include_diff_content = 5;
}

message DriftCheckResponse {
    string report_id = 1;
    string scope = 2;
    string scope_id = 3;
    string check_type = 4;
    string baseline_type = 5;
    string baseline_agent_id = 6;
    string baseline_hash = 7;
    int32 total_agents = 8;
    int32 in_sync_count = 9;
    int32 drifted_count = 10;
    int32 error_count = 11;
    repeated DriftItem items = 12;
    int64 created_at = 13;
}

message DriftItem {
    string agent_id = 1;
    string hostname = 2;
    string status = 3; // "in_sync", "drifted", "missing", "error"
    string current_hash = 4;
    string severity = 5; // "critical", "warning", "info"
    string diff_summary = 6;
    string diff_content = 7;
    string error_message = 8;
}

message ResolveDriftRequest {
    string report_id = 1;
    repeated string agent_ids = 2; // Specific agents to resolve, empty = all drifted
    string action = 3; // "sync_to_baseline", "sync_to_agent", "acknowledge"
    string source_agent_id = 4; // For "sync_to_agent" action
}

// ============================================
// Batch Configuration
// ============================================

message BatchConfigUpdateRequest {
    // Target selection (one required)
    repeated string agent_ids = 1;
    string group_id = 2;
    string environment_id = 3;
    
    // Configuration source (one required)
    string template_id = 4;
    string raw_content = 5;
    string source_agent_id = 6;
    
    // Variables
    map<string, string> variables = 7;
    
    // Strategy
    string strategy = 8; // "parallel", "rolling", "canary"
    int32 batch_size = 9;
    int32 pause_between_batches_seconds = 10;
    
    // Canary
    int32 canary_percentage = 11;
    int32 canary_duration_seconds = 12;
    
    // Safety
    bool dry_run = 13;
    bool validate_only = 14;
    bool backup_first = 15;
    bool rollback_on_fail = 16;
    
    // Metadata
    string description = 17;
    string requested_by = 18;
}

message BatchConfigUpdateResponse {
    string batch_id = 1;
    string status = 2; // "pending", "in_progress", "completed", "partial_failure", "failed", "rolled_back"
    string strategy = 3;
    int32 total_agents = 4;
    int32 current_batch = 5;
    int32 total_batches = 6;
    int32 completed_count = 7;
    int32 failed_count = 8;
    int32 pending_count = 9;
    repeated AgentUpdateResult results = 10;
    int64 started_at = 11;
    int64 completed_at = 12;
    string error = 13;
}

message AgentUpdateResult {
    string agent_id = 1;
    string hostname = 2;
    string status = 3; // "success", "failed", "skipped", "rolled_back", "pending"
    string backup_path = 4;
    string config_hash = 5;
    string error = 6;
    int32 duration_ms = 7;
    int64 completed_at = 8;
}

message GetBatchStatusRequest {
    string batch_id = 1;
}

message CancelBatchRequest {
    string batch_id = 1;
}

message RollbackBatchRequest {
    string batch_id = 1;
}

// ============================================
// Maintenance
// ============================================

message MaintenanceRequest {
    bool enable = 1;
    string scope = 2; // "agent", "group", "environment", "project", "site", "location"
    string scope_id = 3;
    string site_filter = 4;
    string location_filter = 5;
    string template_id = 6;
    map<string, string> variables = 7;
    int64 scheduled_end_timestamp = 8;
    string reason = 9;
    repeated string bypass_ips = 10;
    map<string, string> bypass_headers = 11;
    string requested_by = 12;
}

message MaintenanceResponse {
    bool success = 1;
    string maintenance_state_id = 2;
    repeated AgentMaintenanceResult results = 3;
    string error = 4;
}

message AgentMaintenanceResult {
    string agent_id = 1;
    string hostname = 2;
    bool success = 3;
    string error = 4;
}

message GetMaintenanceStatusRequest {
    string scope = 1;
    string scope_id = 2;
    string site_filter = 3;
    string location_filter = 4;
}

message MaintenanceStatus {
    string id = 1;
    bool is_enabled = 2;
    string scope = 3;
    string scope_id = 4;
    string site_filter = 5;
    string location_filter = 6;
    string template_id = 7;
    int64 enabled_at = 8;
    string enabled_by = 9;
    int64 scheduled_end = 10;
    string reason = 11;
    repeated string bypass_ips = 12;
}

message ListMaintenanceStatesRequest {
    string project_id = 1;
    string environment_id = 2;
    bool enabled_only = 3;
}

message ListMaintenanceStatesResponse {
    repeated MaintenanceStatus states = 1;
}

// ============================================
// Certificates
// ============================================

message CertificateUploadRequest {
    string domain = 1;
    bytes cert_content = 2;
    bytes key_content = 3;
    bytes chain_content = 4;
    string cert_type = 5;
    
    // Target selection
    repeated string agent_ids = 6;
    string group_id = 7;
    string environment_id = 8;
    
    // Options
    bool backup_existing = 9;
    bool reload_nginx = 10;
    
    string requested_by = 11;
}

message CertificateUploadResponse {
    bool success = 1;
    string certificate_id = 2;
    repeated CertDeploymentResult deployments = 3;
    string error = 4;
}

message CertDeploymentResult {
    string agent_id = 1;
    string hostname = 2;
    bool success = 3;
    string cert_path = 4;
    string key_path = 5;
    string error = 6;
}

message GetCertificateInventoryRequest {
    string environment_id = 1;
    bool expiring_only = 2;
    int32 expiring_within_days = 3;
}

message CertificateInventoryResponse {
    repeated CertificateInfo certificates = 1;
}

message CertificateInfo {
    string id = 1;
    string domain = 2;
    string cert_type = 3;
    string issuer = 4;
    int64 expiry_timestamp = 5;
    int32 days_until_expiry = 6;
    repeated string san_domains = 7;
    bool auto_renew = 8;
    int32 deployed_to_count = 9;
}

// ============================================
// Environment Comparison
// ============================================

message EnvironmentCompareRequest {
    string source_environment_id = 1;
    string target_environment_id = 2;
    repeated string compare_types = 3;
    bool include_diff_content = 4;
    map<string, string> group_mapping = 5;
}

message EnvironmentCompareResponse {
    string comparison_id = 1;
    string source_environment = 2;
    string target_environment = 3;
    int64 compared_at = 4;
    repeated ComparisonCategory categories = 5;
    ComparisonSummary summary = 6;
}

message ComparisonCategory {
    string type = 1;
    int32 source_count = 2;
    int32 target_count = 3;
    int32 same_count = 4;
    int32 different_count = 5;
    int32 source_only_count = 6;
    int32 target_only_count = 7;
    repeated ConfigDifference differences = 8;
}

message ConfigDifference {
    string identifier = 1;
    string status = 2; // "same", "different", "source_only", "target_only"
    string source_value = 3;
    string target_value = 4;
    string diff = 5;
    string severity = 6;
}

message ComparisonSummary {
    int32 total_checks = 1;
    int32 identical_count = 2;
    int32 different_count = 3;
    bool has_critical_diffs = 4;
}

// ============================================
// Site/Location Updates
// ============================================

message SiteLocationUpdateRequest {
    string target = 1; // "agent", "group", "environment"
    string target_id = 2;
    string server_name = 3;
    string location_path = 4;
    string action = 5; // "create", "update", "delete"
    LocationConfig config = 6;
    bool dry_run = 7;
    bool backup_first = 8;
    bool reload_nginx = 9;
    string requested_by = 10;
}

message LocationConfig {
    string proxy_pass = 1;
    map<string, string> proxy_headers = 2;
    int32 proxy_connect_timeout = 3;
    int32 proxy_read_timeout = 4;
    RateLimitConfig rate_limit = 5;
    CacheConfig cache = 6;
    repeated string allowed_methods = 7;
    repeated string deny_ips = 8;
    repeated string allow_ips = 9;
    string custom_directives = 10;
}

message RateLimitConfig {
    string zone = 1;
    string rate = 2;
    int32 burst = 3;
    bool no_delay = 4;
}

message CacheConfig {
    string zone = 1;
    repeated string valid = 2;
    repeated string methods = 3;
    string key = 4;
    string bypass_var = 5;
}

message SiteLocationUpdateResponse {
    bool success = 1;
    repeated AgentUpdateResult results = 2;
    string validation_error = 3;
}

// ============================================
// Service Definition Updates
// ============================================

service AgentService {
    // Existing methods...
    
    // Groups
    rpc ListGroups(ListGroupsRequest) returns (ListGroupsResponse);
    rpc GetGroup(GetGroupRequest) returns (Group);
    rpc CreateGroup(CreateGroupRequest) returns (Group);
    rpc UpdateGroup(UpdateGroupRequest) returns (Group);
    rpc DeleteGroup(DeleteGroupRequest) returns (DeleteGroupResponse);
    rpc AddAgentsToGroup(AddAgentsToGroupRequest) returns (AddAgentsToGroupResponse);
    rpc RemoveAgentFromGroup(RemoveAgentFromGroupRequest) returns (RemoveAgentFromGroupResponse);
    rpc SetGoldenAgent(SetGoldenAgentRequest) returns (SetGoldenAgentResponse);
    
    // Drift Detection
    rpc CheckDrift(DriftCheckRequest) returns (DriftCheckResponse);
    rpc GetDriftReport(GetDriftReportRequest) returns (DriftCheckResponse);
    rpc ListDriftReports(ListDriftReportsRequest) returns (ListDriftReportsResponse);
    rpc ResolveDrift(ResolveDriftRequest) returns (BatchConfigUpdateResponse);
    
    // Batch Config
    rpc BatchUpdateConfig(BatchConfigUpdateRequest) returns (BatchConfigUpdateResponse);
    rpc GetBatchStatus(GetBatchStatusRequest) returns (BatchConfigUpdateResponse);
    rpc CancelBatch(CancelBatchRequest) returns (CancelBatchResponse);
    rpc RollbackBatch(RollbackBatchRequest) returns (RollbackBatchResponse);
    
    // Templates
    rpc ListConfigTemplates(ListConfigTemplatesRequest) returns (ListConfigTemplatesResponse);
    rpc GetConfigTemplate(GetConfigTemplateRequest) returns (ConfigTemplate);
    rpc CreateConfigTemplate(CreateConfigTemplateRequest) returns (ConfigTemplate);
    rpc UpdateConfigTemplate(UpdateConfigTemplateRequest) returns (ConfigTemplate);
    rpc DeleteConfigTemplate(DeleteConfigTemplateRequest) returns (DeleteConfigTemplateResponse);
    rpc RenderConfigTemplate(RenderConfigTemplateRequest) returns (RenderConfigTemplateResponse);
    
    // Maintenance
    rpc SetMaintenance(MaintenanceRequest) returns (MaintenanceResponse);
    rpc GetMaintenanceStatus(GetMaintenanceStatusRequest) returns (MaintenanceStatus);
    rpc ListMaintenanceStates(ListMaintenanceStatesRequest) returns (ListMaintenanceStatesResponse);
    rpc ListMaintenanceTemplates(ListMaintenanceTemplatesRequest) returns (ListMaintenanceTemplatesResponse);
    rpc CreateMaintenanceTemplate(CreateMaintenanceTemplateRequest) returns (MaintenanceTemplate);
    rpc UpdateMaintenanceTemplate(UpdateMaintenanceTemplateRequest) returns (MaintenanceTemplate);
    rpc DeleteMaintenanceTemplate(DeleteMaintenanceTemplateRequest) returns (DeleteMaintenanceTemplateResponse);
    
    // Certificates
    rpc UploadCertificate(CertificateUploadRequest) returns (CertificateUploadResponse);
    rpc GetCertificateInventory(GetCertificateInventoryRequest) returns (CertificateInventoryResponse);
    rpc DeployCertificate(DeployCertificateRequest) returns (CertificateUploadResponse);
    rpc CheckCertificateDrift(DriftCheckRequest) returns (DriftCheckResponse);
    
    // Environment Comparison
    rpc CompareEnvironments(EnvironmentCompareRequest) returns (EnvironmentCompareResponse);
    rpc GetEnvironmentComparison(GetEnvironmentComparisonRequest) returns (EnvironmentCompareResponse);
    
    // Site/Location
    rpc UpdateSiteLocation(SiteLocationUpdateRequest) returns (SiteLocationUpdateResponse);
}
```

---

## 12. Frontend Components

### 12.1 Component Hierarchy

```
src/
├── app/
│   ├── groups/
│   │   ├── page.tsx                    # Group list
│   │   └── [id]/
│   │       └── page.tsx                # Group detail
│   ├── drift/
│   │   ├── page.tsx                    # Drift dashboard
│   │   └── [id]/
│   │       └── page.tsx                # Drift report detail
│   ├── maintenance/
│   │   ├── page.tsx                    # Maintenance control
│   │   └── templates/
│   │       └── page.tsx                # Template management
│   ├── certificates/
│   │   └── page.tsx                    # Certificate management
│   └── compare/
│       └── page.tsx                    # Environment comparison
├── components/
│   ├── groups/
│   │   ├── group-list.tsx
│   │   ├── group-card.tsx
│   │   ├── group-create-dialog.tsx
│   │   ├── group-agent-assignment.tsx
│   │   └── golden-agent-selector.tsx
│   ├── drift/
│   │   ├── drift-status-badge.tsx
│   │   ├── drift-summary-card.tsx
│   │   ├── drift-detail-table.tsx
│   │   ├── drift-diff-viewer.tsx
│   │   └── drift-resolve-dialog.tsx
│   ├── batch/
│   │   ├── batch-update-wizard.tsx
│   │   ├── batch-progress-tracker.tsx
│   │   ├── strategy-selector.tsx
│   │   └── batch-result-summary.tsx
│   ├── maintenance/
│   │   ├── maintenance-toggle.tsx
│   │   ├── maintenance-scope-selector.tsx
│   │   ├── maintenance-template-editor.tsx
│   │   ├── maintenance-preview.tsx
│   │   └── bypass-rules-editor.tsx
│   ├── certificates/
│   │   ├── certificate-list.tsx
│   │   ├── certificate-upload-dialog.tsx
│   │   ├── certificate-deploy-wizard.tsx
│   │   └── expiry-warning-badge.tsx
│   ├── compare/
│   │   ├── environment-selector.tsx
│   │   ├── comparison-result-view.tsx
│   │   └── diff-viewer.tsx
│   └── templates/
│       ├── template-list.tsx
│       ├── template-editor.tsx
│       ├── variable-form.tsx
│       └── template-preview.tsx
└── lib/
    ├── api/
    │   ├── groups.ts
    │   ├── drift.ts
    │   ├── batch.ts
    │   ├── maintenance.ts
    │   ├── certificates.ts
    │   └── compare.ts
    └── hooks/
        ├── use-groups.ts
        ├── use-drift-status.ts
        ├── use-batch-progress.ts
        └── use-maintenance-state.ts
```

### 12.2 Key UI Components

#### 12.2.1 Drift Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Drift Detection Dashboard                      [Check Now ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ US-East-Web     │  │ US-West-Web     │  │ API-Gateways    │  │
│  │ ────────────────│  │ ────────────────│  │ ────────────────│  │
│  │ ● 3/3 In Sync   │  │ ⚠ 1/2 Drifted   │  │ ● 2/2 In Sync   │  │
│  │                 │  │                 │  │                 │  │
│  │ Last: 2m ago    │  │ Last: 2m ago    │  │ Last: 2m ago    │  │
│  │ [View Details]  │  │ [View Details]  │  │ [View Details]  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│  Recent Drift Reports                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Group          │ Type        │ Status      │ Time         │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ US-West-Web    │ nginx_conf  │ ⚠ 1 drifted │ 2 min ago    │  │
│  │ US-East-Web    │ ssl_certs   │ ● all sync  │ 5 min ago    │  │
│  │ API-Gateways   │ nginx_conf  │ ● all sync  │ 5 min ago    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.2.2 Drift Detail View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Drift Report: US-West-Web - nginx_conf               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Baseline: nginx-web-04 (golden agent)     Checked: 2 min ago   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Agent           │ Status    │ Diff Summary │ Actions      │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ nginx-web-04    │ ● Baseline│ -            │              │  │
│  │ nginx-web-05    │ ⚠ Drifted │ +3, -1 lines │ [View] [Sync]│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Diff: nginx-web-05 vs baseline                              ││
│  │ ───────────────────────────────────────────────────────────-││
│  │   worker_processes auto;                                    ││
│  │ - worker_connections 1024;                                  ││
│  │ + worker_connections 2048;                                  ││
│  │ + keepalive_timeout 75;                                     ││
│  │   ...                                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [Sync All to Baseline]  [Acknowledge Differences]              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.2.3 Maintenance Control Panel

```
┌─────────────────────────────────────────────────────────────────┐
│  Maintenance Mode Control                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Scope: ○ Agent  ○ Group  ● Environment  ○ Project  ○ Site      │
│                                                                  │
│  Environment: [Production           ▼]                          │
│                                                                  │
│  Template: [Default Maintenance Page ▼]  [Preview]              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Bypass Rules                                              │  │
│  │ ─────────────────────────────────────────────────────────-│  │
│  │ IPs:    [10.0.0.1, 192.168.1.0/24                     ]   │  │
│  │ Header: [X-Bypass-Maintenance] = [secret-token       ]    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ☐ Schedule auto-disable                                        │
│    End time: [2026-03-02 18:00 ▼]                              │
│                                                                  │
│  Reason: [Scheduled maintenance window                      ]   │
│                                                                  │
│  Affected Agents (6):                                           │
│  nginx-web-01, nginx-web-02, nginx-web-03, nginx-api-01, ...    │
│                                                                  │
│  [Cancel]                              [Enable Maintenance Mode]│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. Implementation Phases

### Phase 1: Agent Groups (Foundation)

**Scope**:
- Database migration for `agent_groups` table
- Update `server_assignments` with `group_id`
- Group CRUD API endpoints
- Agent auto-assignment via `LABEL_group`
- Frontend: Group management UI

**Deliverables**:
- `007_agent_groups.sql` migration
- `cmd/gateway/groups.go` - Group handlers
- `frontend/src/app/groups/` - Group pages
- `frontend/src/components/groups/` - Group components

**Dependencies**: None

---

### Phase 2: Enhanced Heartbeat (Config Hashes)

**Scope**:
- Add `ConfigHashes` to Heartbeat proto
- Agent-side config hash computation
- Gateway storage of config hashes
- Basic drift status in UI

**Deliverables**:
- Updated `agent.proto` with ConfigHashes
- `cmd/agent/config/hasher.go` - Hash computation
- Gateway heartbeat handler updates
- `config_snapshots` table migration

**Dependencies**: Phase 1

---

### Phase 3: Drift Detection

**Scope**:
- Drift check API implementation
- Intra-group drift detection
- Drift report storage and retrieval
- Drift resolution actions
- Frontend: Drift dashboard

**Deliverables**:
- `cmd/gateway/drift.go` - Drift detection logic
- `009_drift_detection.sql` migration
- Drift API endpoints
- `frontend/src/app/drift/` - Drift pages
- `frontend/src/components/drift/` - Drift components

**Dependencies**: Phase 2

---

### Phase 4: Batch Configuration Updates

**Scope**:
- Batch update API
- Rolling and parallel strategies
- Progress tracking
- Rollback capability
- Frontend: Batch update wizard

**Deliverables**:
- `cmd/gateway/batch.go` - Batch orchestration
- `010_batch_updates.sql` migration
- `frontend/src/components/batch/` - Batch components

**Dependencies**: Phase 3

---

### Phase 5: Configuration Templates

**Scope**:
- Template CRUD API
- Variable substitution engine
- Template rendering
- Template assignment tracking
- Frontend: Template editor

**Deliverables**:
- `008_config_templates.sql` migration
- `cmd/gateway/templates.go` - Template handlers
- Template rendering engine
- `frontend/src/components/templates/` - Template components

**Dependencies**: Phase 4

---

### Phase 6: Maintenance Mode

**Scope**:
- Maintenance state management
- NGINX maintenance config injection
- Maintenance templates
- Bypass rules
- Frontend: Maintenance control panel

**Deliverables**:
- `011_maintenance.sql` migration
- `cmd/gateway/maintenance.go` - Maintenance handlers
- `cmd/agent/maintenance.go` - Agent-side maintenance
- `frontend/src/app/maintenance/` - Maintenance pages

**Dependencies**: Phase 5

---

### Phase 7: Certificate Management

**Scope**:
- Certificate upload and deployment
- Certificate inventory
- Certificate drift detection
- Expiry notifications
- Frontend: Certificate manager

**Deliverables**:
- `012_certificates.sql` migration
- `cmd/gateway/certificates.go` - Certificate handlers
- `cmd/agent/certificates.go` - Agent certificate handling
- `frontend/src/app/certificates/` - Certificate pages

**Dependencies**: Phase 3

---

### Phase 8: Environment Comparison

**Scope**:
- Cross-environment comparison API
- Diff generation
- Comparison result storage
- Frontend: Environment comparison view

**Deliverables**:
- `013_environment_compare.sql` migration
- `cmd/gateway/compare.go` - Comparison handlers
- `frontend/src/app/compare/` - Comparison pages

**Dependencies**: Phase 3

---

### Phase 9: Site/Location Management

**Scope**:
- Site/location update API
- Batch site updates
- Location-level maintenance
- Frontend: Site/location editor

**Deliverables**:
- `cmd/gateway/sites.go` - Site handlers
- Enhanced provisions system
- `frontend/src/components/sites/` - Site components

**Dependencies**: Phase 6

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Agent** | Go binary running alongside NGINX, manages local config and reports to gateway |
| **Gateway** | Central orchestrator that manages agents and stores state |
| **Project** | Top-level organizational unit (e.g., "E-Commerce Platform") |
| **Environment** | Deployment stage within a project (e.g., Production, Staging) |
| **Group** | Operational grouping of agents within an environment (e.g., "US-East-Web") |
| **Golden Agent** | Designated agent whose configuration serves as the baseline for drift detection |
| **Drift** | Configuration difference between agents that should be identical |
| **Template** | Reusable configuration with variable substitution |
| **Maintenance Mode** | State where NGINX returns maintenance page instead of normal traffic |

---

## Appendix B: Error Codes

| Code | Description |
|------|-------------|
| `DRIFT_001` | No agents in group for drift check |
| `DRIFT_002` | Golden agent not found or offline |
| `DRIFT_003` | Failed to fetch config from agent |
| `BATCH_001` | No agents selected for batch update |
| `BATCH_002` | Validation failed for config |
| `BATCH_003` | Rollback failed |
| `MAINT_001` | Maintenance template not found |
| `MAINT_002` | Failed to inject maintenance config |
| `CERT_001` | Invalid certificate format |
| `CERT_002` | Certificate/key mismatch |
| `CERT_003` | Certificate deployment failed |

---

## Appendix C: Configuration Reference

### Agent Configuration (avika-agent.conf)

```ini
# Group auto-assignment
LABEL_project=ecommerce
LABEL_environment=production
LABEL_group=us-east-web

# Config hash reporting
CONFIG_HASH_ENABLED=true
CONFIG_HASH_INTERVAL=60

# Maintenance page location
MAINTENANCE_ROOT=/etc/nginx/maintenance
```

### Gateway Configuration (gateway.yaml)

```yaml
drift:
  enabled: true
  default_interval: 300  # seconds
  cleanup_after: 168     # hours (7 days)
  
batch:
  max_parallel: 10
  default_batch_size: 2
  default_pause: 30      # seconds
  
maintenance:
  default_template: default
  bypass_header: X-Bypass-Maintenance
  
certificates:
  expiry_warning_days: [30, 14, 7, 1]
  auto_renewal_days: 30
```
