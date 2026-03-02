# Test Cases: Agent Grouping, Drift Detection & Configuration Management

**Version**: 1.0  
**Created**: 2026-03-02  

---

## Table of Contents

1. [Agent Groups](#1-agent-groups)
2. [Drift Detection](#2-drift-detection)
3. [Batch Configuration Updates](#3-batch-configuration-updates)
4. [Configuration Templates](#4-configuration-templates)
5. [Maintenance Page System](#5-maintenance-page-system)
6. [Certificate Management](#6-certificate-management)
7. [Environment Comparison](#7-environment-comparison)
8. [Site/Location Configuration](#8-sitelocation-configuration)
9. [Integration Tests](#9-integration-tests)
10. [Performance Tests](#10-performance-tests)
11. [Security Tests](#11-security-tests)

---

## 1. Agent Groups

### 1.1 Group CRUD Operations

#### TC-GRP-001: Create Agent Group
**Description**: Create a new agent group within an environment  
**Preconditions**: 
- User has `admin` or `write` permission on the project
- Environment exists

**Test Steps**:
1. POST `/api/v1/groups` with valid payload
2. Verify response status 201
3. Verify group appears in database
4. Verify group appears in list endpoint

**Test Data**:
```json
{
  "environment_id": "env-uuid",
  "name": "US-East-Web",
  "slug": "us-east-web",
  "description": "Web tier servers in US East region",
  "drift_check_enabled": true,
  "drift_check_interval_seconds": 300
}
```

**Expected Result**: Group created successfully with generated UUID

---

#### TC-GRP-002: Create Group with Duplicate Slug
**Description**: Attempt to create a group with existing slug in same environment  
**Preconditions**: Group "us-east-web" exists in environment

**Test Steps**:
1. POST `/api/v1/groups` with duplicate slug
2. Verify response status 409 (Conflict)
3. Verify error message indicates duplicate slug

**Expected Result**: Request rejected with appropriate error

---

#### TC-GRP-003: Create Group with Same Slug in Different Environment
**Description**: Create group with same slug but in different environment  
**Preconditions**: 
- Group "web-tier" exists in Production environment
- Staging environment exists

**Test Steps**:
1. POST `/api/v1/groups` with slug "web-tier" for Staging
2. Verify response status 201
3. Verify both groups exist independently

**Expected Result**: Group created successfully (slugs are environment-scoped)

---

#### TC-GRP-004: Update Group Properties
**Description**: Update group name, description, and drift settings  
**Preconditions**: Group exists

**Test Steps**:
1. PUT `/api/v1/groups/{id}` with updated properties
2. Verify response status 200
3. Verify updated values in response
4. Verify database reflects changes

**Test Data**:
```json
{
  "name": "US-East-Web-Updated",
  "description": "Updated description",
  "drift_check_interval_seconds": 600
}
```

**Expected Result**: Group updated successfully

---

#### TC-GRP-005: Delete Group with Agents
**Description**: Delete a group that contains assigned agents  
**Preconditions**: Group exists with 3 agents assigned

**Test Steps**:
1. DELETE `/api/v1/groups/{id}`
2. Verify response status 200
3. Verify group removed from database
4. Verify agents still exist but have `group_id = NULL`
5. Verify agents remain in their environment

**Expected Result**: Group deleted, agents become ungrouped but stay in environment

---

#### TC-GRP-006: Delete Non-existent Group
**Description**: Attempt to delete group that doesn't exist  
**Preconditions**: None

**Test Steps**:
1. DELETE `/api/v1/groups/{non-existent-uuid}`
2. Verify response status 404

**Expected Result**: 404 Not Found error

---

### 1.2 Agent Assignment

#### TC-GRP-010: Add Single Agent to Group
**Description**: Assign one agent to a group  
**Preconditions**: 
- Group exists
- Agent exists in same environment, not assigned to any group

**Test Steps**:
1. POST `/api/v1/groups/{id}/agents` with agent_id
2. Verify response status 200
3. Verify agent's group_id updated in server_assignments table
4. Verify agent appears in group's agent list

**Test Data**:
```json
{
  "agent_ids": ["agent-001"]
}
```

**Expected Result**: Agent assigned to group

---

#### TC-GRP-011: Add Multiple Agents to Group (Bulk)
**Description**: Assign multiple agents to a group at once  
**Preconditions**: 
- Group exists
- 5 agents exist in same environment

**Test Steps**:
1. POST `/api/v1/groups/{id}/agents` with multiple agent_ids
2. Verify response status 200
3. Verify all agents assigned
4. Verify response shows success for each agent

**Test Data**:
```json
{
  "agent_ids": ["agent-001", "agent-002", "agent-003", "agent-004", "agent-005"]
}
```

**Expected Result**: All 5 agents assigned to group

---

#### TC-GRP-012: Add Agent Already in Another Group
**Description**: Attempt to assign agent that's already in a different group  
**Preconditions**: 
- Agent is assigned to Group A
- Group B exists

**Test Steps**:
1. POST `/api/v1/groups/{group-b-id}/agents` with agent in Group A
2. Verify response indicates agent moved (or error based on policy)

**Expected Result**: Either agent moved to new group OR error requiring explicit move

---

#### TC-GRP-013: Add Agent from Different Environment
**Description**: Attempt to assign agent from a different environment  
**Preconditions**: 
- Group in Production environment
- Agent in Staging environment

**Test Steps**:
1. POST `/api/v1/groups/{prod-group-id}/agents` with staging agent
2. Verify response status 400 (Bad Request)
3. Verify error message indicates environment mismatch

**Expected Result**: Request rejected - cross-environment assignment not allowed

---

#### TC-GRP-014: Remove Agent from Group
**Description**: Remove an agent from its group  
**Preconditions**: Agent is assigned to group

**Test Steps**:
1. DELETE `/api/v1/groups/{id}/agents/{agent_id}`
2. Verify response status 200
3. Verify agent's group_id is NULL
4. Verify agent still in environment

**Expected Result**: Agent removed from group, remains in environment

---

#### TC-GRP-015: Move Agent Between Groups
**Description**: Move agent from one group to another  
**Preconditions**: 
- Agent in Group A
- Group B exists in same environment

**Test Steps**:
1. PUT `/api/v1/agents/{id}/group` with new group_id
2. Verify response status 200
3. Verify agent removed from Group A
4. Verify agent added to Group B

**Test Data**:
```json
{
  "group_id": "group-b-uuid"
}
```

**Expected Result**: Agent moved successfully

---

### 1.3 Golden Agent

#### TC-GRP-020: Set Golden Agent
**Description**: Designate a golden agent for drift baseline  
**Preconditions**: 
- Group exists with 3 agents
- All agents online

**Test Steps**:
1. PUT `/api/v1/groups/{id}/golden-agent` with agent_id
2. Verify response status 200
3. Verify group's golden_agent_id updated
4. Verify agent marked as golden in response

**Test Data**:
```json
{
  "agent_id": "agent-001"
}
```

**Expected Result**: Agent set as golden agent

---

#### TC-GRP-021: Set Golden Agent Not in Group
**Description**: Attempt to set golden agent that's not in the group  
**Preconditions**: 
- Group A exists
- Agent in Group B

**Test Steps**:
1. PUT `/api/v1/groups/{group-a-id}/golden-agent` with agent from Group B
2. Verify response status 400
3. Verify error message

**Expected Result**: Request rejected - agent must be in group

---

#### TC-GRP-022: Remove Golden Agent
**Description**: Clear golden agent designation  
**Preconditions**: Group has golden agent set

**Test Steps**:
1. DELETE `/api/v1/groups/{id}/golden-agent`
2. Verify response status 200
3. Verify group's golden_agent_id is NULL

**Expected Result**: Golden agent cleared

---

#### TC-GRP-023: Golden Agent Goes Offline
**Description**: Verify drift detection handles offline golden agent  
**Preconditions**: 
- Group has golden agent
- Golden agent goes offline

**Test Steps**:
1. Disconnect golden agent
2. Trigger drift check
3. Verify drift check fails gracefully with appropriate error
4. Verify fallback to majority-vote baseline (if configured)

**Expected Result**: Drift check handles offline golden agent gracefully

---

### 1.4 Auto-Assignment

#### TC-GRP-030: Auto-Assign Agent via Labels
**Description**: Agent auto-assigns to group based on labels  
**Preconditions**: 
- Group "us-east-web" exists in Production
- Agent not yet registered

**Test Steps**:
1. Start agent with labels: `LABEL_project=myproject`, `LABEL_environment=production`, `LABEL_group=us-east-web`
2. Agent connects and sends heartbeat
3. Verify agent auto-assigned to correct environment
4. Verify agent auto-assigned to correct group

**Expected Result**: Agent automatically placed in correct group

---

#### TC-GRP-031: Auto-Assign with Non-existent Group
**Description**: Agent specifies group that doesn't exist  
**Preconditions**: Agent has label for non-existent group

**Test Steps**:
1. Start agent with `LABEL_group=non-existent-group`
2. Agent connects and sends heartbeat
3. Verify agent assigned to environment but not to any group
4. Verify warning logged

**Expected Result**: Agent in environment but ungrouped, with warning

---

---

## 2. Drift Detection

### 2.1 Config Hash Collection

#### TC-DFT-001: Agent Reports Config Hashes in Heartbeat
**Description**: Verify agent includes config hashes in heartbeat  
**Preconditions**: Agent running with nginx.conf

**Test Steps**:
1. Agent sends heartbeat
2. Capture heartbeat at gateway
3. Verify ConfigHashes field present
4. Verify main_conf_hash computed correctly (SHA256)
5. Verify site_configs array populated
6. Verify certificates array populated

**Expected Result**: All config hashes reported correctly

---

#### TC-DFT-002: Hash Changes on Config Modification
**Description**: Verify hash updates when config file changes  
**Preconditions**: Agent running, initial hash recorded

**Test Steps**:
1. Record initial main_conf_hash
2. Modify nginx.conf (add a comment)
3. Wait for next heartbeat
4. Verify main_conf_hash changed
5. Verify modified_at timestamp updated

**Expected Result**: New hash reflects config change

---

#### TC-DFT-003: Hash Computation Includes All Config Files
**Description**: Verify all nginx config files are hashed  
**Preconditions**: Agent with multiple config files

**Test Steps**:
1. Create nginx setup with:
   - /etc/nginx/nginx.conf
   - /etc/nginx/sites-enabled/site1.conf
   - /etc/nginx/sites-enabled/site2.conf
   - /etc/nginx/conf.d/ssl.conf
2. Verify all files appear in heartbeat hashes
3. Modify site1.conf
4. Verify only site1.conf hash changes

**Expected Result**: All config files tracked individually

---

### 2.2 Intra-Group Drift Detection

#### TC-DFT-010: All Agents In Sync
**Description**: Drift check when all agents have identical configs  
**Preconditions**: 
- Group with 3 agents
- All agents have identical nginx.conf

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify response shows all agents in_sync
3. Verify drifted_count = 0
4. Verify baseline_hash matches all agent hashes

**Test Data**:
```json
{
  "scope": "group",
  "scope_id": "group-uuid",
  "check_types": ["nginx_main_conf"]
}
```

**Expected Result**: All agents reported as in_sync

---

#### TC-DFT-011: Single Agent Drifted
**Description**: Detect when one agent has different config  
**Preconditions**: 
- Group with 3 agents
- Agent-3 has modified nginx.conf

**Test Steps**:
1. Modify nginx.conf on agent-3
2. POST `/api/v1/drift/check` for group
3. Verify agent-1 and agent-2 show in_sync
4. Verify agent-3 shows drifted
5. Verify diff_summary shows changes
6. Verify diff_content contains unified diff

**Expected Result**: Agent-3 flagged as drifted with diff

---

#### TC-DFT-012: Majority Vote Baseline
**Description**: Baseline determined by most common config  
**Preconditions**: 
- Group with 5 agents, no golden agent
- 3 agents have config A
- 2 agents have config B

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify baseline_type = "majority"
3. Verify baseline_hash matches config A
4. Verify 3 agents in_sync
5. Verify 2 agents drifted

**Expected Result**: Config A used as baseline (majority)

---

#### TC-DFT-013: Golden Agent Baseline
**Description**: Use golden agent config as baseline  
**Preconditions**: 
- Group with golden agent set
- Golden agent has config A
- Other agents have config B (majority)

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify baseline_type = "golden_agent"
3. Verify baseline_agent_id matches golden agent
4. Verify golden agent's config used (not majority)

**Expected Result**: Golden agent config used as baseline

---

#### TC-DFT-014: Drift with Diff Content
**Description**: Verify unified diff generated correctly  
**Preconditions**: 
- Group with 2 agents
- Agent-2 has extra line in config

**Test Steps**:
1. Add line `worker_connections 2048;` to agent-2
2. POST `/api/v1/drift/check` with include_diff_content=true
3. Verify diff_content shows:
   ```diff
   - worker_connections 1024;
   + worker_connections 2048;
   ```

**Expected Result**: Correct unified diff generated

---

#### TC-DFT-015: Drift Detection Multiple Check Types
**Description**: Check multiple config types in one request  
**Preconditions**: Group with agents

**Test Steps**:
1. POST `/api/v1/drift/check` with multiple check_types
2. Verify separate drift results for each type
3. Verify each type can have different drift status

**Test Data**:
```json
{
  "scope": "group",
  "scope_id": "group-uuid",
  "check_types": ["nginx_main_conf", "ssl_certs", "maintenance_page"]
}
```

**Expected Result**: Independent drift results per check type

---

#### TC-DFT-016: Drift Check with Single Agent in Group
**Description**: Handle drift check when group has only one agent  
**Preconditions**: Group with 1 agent

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify response indicates single agent (nothing to compare)
3. Verify no error thrown

**Expected Result**: Graceful handling with appropriate message

---

#### TC-DFT-017: Drift Check with Offline Agent
**Description**: Handle offline agent during drift check  
**Preconditions**: 
- Group with 3 agents
- Agent-3 is offline

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify agent-1 and agent-2 compared
3. Verify agent-3 status = "error" with message
4. Verify error_count = 1

**Expected Result**: Offline agent reported as error, others checked

---

### 2.3 Cross-Group Drift Detection

#### TC-DFT-020: Compare Configs Across Groups
**Description**: Detect drift between groups in same environment  
**Preconditions**: 
- Environment with 2 groups
- Groups should have similar base config

**Test Steps**:
1. POST `/api/v1/drift/check` with scope=environment
2. Verify comparison across groups
3. Verify differences between groups reported

**Expected Result**: Cross-group drift detected and reported

---

### 2.4 Drift Resolution

#### TC-DFT-030: Sync Drifted Agent to Baseline
**Description**: Push baseline config to drifted agent  
**Preconditions**: 
- Drift report exists with agent-3 drifted
- Baseline config available

**Test Steps**:
1. POST `/api/v1/drift/resolve` with action=sync_to_baseline
2. Verify baseline config pushed to agent-3
3. Verify agent-3 creates backup
4. Verify nginx reload on agent-3
5. Re-run drift check
6. Verify agent-3 now in_sync

**Test Data**:
```json
{
  "report_id": "drift-report-uuid",
  "agent_ids": ["agent-3"],
  "action": "sync_to_baseline"
}
```

**Expected Result**: Agent synced to baseline

---

#### TC-DFT-031: Sync All Drifted Agents
**Description**: Sync all drifted agents at once  
**Preconditions**: 
- 3 agents drifted in group

**Test Steps**:
1. POST `/api/v1/drift/resolve` with empty agent_ids (all)
2. Verify all 3 agents receive baseline config
3. Verify all agents reload successfully
4. Re-run drift check
5. Verify all agents in_sync

**Expected Result**: All drifted agents synced

---

#### TC-DFT-032: Acknowledge Drift as Intentional
**Description**: Mark drift as intentional (don't flag in future)  
**Preconditions**: 
- Agent has intentional config difference
- Override record created

**Test Steps**:
1. POST `/api/v1/drift/resolve` with action=acknowledge
2. Verify override record created in agent_config_overrides
3. Re-run drift check
4. Verify agent not flagged as drifted

**Expected Result**: Drift acknowledged and excluded from future checks

---

#### TC-DFT-033: Sync to Specific Agent
**Description**: Use specific agent's config as new baseline  
**Preconditions**: 
- Group with drifted agents
- Agent-2 has desired config

**Test Steps**:
1. POST `/api/v1/drift/resolve` with action=sync_to_agent
2. Verify agent-2's config used as source
3. Verify all other agents receive agent-2's config
4. Re-run drift check
5. Verify all in_sync

**Test Data**:
```json
{
  "report_id": "drift-report-uuid",
  "action": "sync_to_agent",
  "source_agent_id": "agent-2"
}
```

**Expected Result**: All agents synced to agent-2's config

---

### 2.5 Scheduled Drift Detection

#### TC-DFT-040: Automatic Periodic Drift Check
**Description**: Verify drift checks run automatically  
**Preconditions**: 
- Group with drift_check_enabled=true
- drift_check_interval_seconds=60

**Test Steps**:
1. Wait for scheduled drift check to trigger
2. Verify drift report created automatically
3. Verify timestamp matches expected interval

**Expected Result**: Automatic drift checks at configured interval

---

#### TC-DFT-041: Drift Check on Agent Join
**Description**: Trigger drift check when new agent joins group  
**Preconditions**: 
- Group with 2 agents
- New agent available

**Test Steps**:
1. Add new agent to group
2. Verify drift check triggered automatically
3. Verify new agent included in check

**Expected Result**: Drift check triggered on group membership change

---

---

## 3. Batch Configuration Updates

### 3.1 Parallel Strategy

#### TC-BCH-001: Parallel Update All Agents
**Description**: Update all agents in group simultaneously  
**Preconditions**: Group with 5 agents, all online

**Test Steps**:
1. POST `/api/v1/config/batch` with strategy=parallel
2. Verify all agents receive config simultaneously
3. Verify all agents reload
4. Verify batch status = completed
5. Verify all results show success

**Test Data**:
```json
{
  "group_id": "group-uuid",
  "raw_content": "worker_processes auto; ...",
  "strategy": "parallel",
  "backup_first": true
}
```

**Expected Result**: All agents updated in parallel

---

#### TC-BCH-002: Parallel Update with One Failure
**Description**: Handle single agent failure in parallel update  
**Preconditions**: 
- Group with 5 agents
- Agent-3 will reject config (syntax error for that agent)

**Test Steps**:
1. POST `/api/v1/config/batch` with strategy=parallel
2. Verify 4 agents succeed
3. Verify agent-3 fails with validation error
4. Verify batch status = partial_failure
5. Verify failed agent has backup intact

**Expected Result**: Partial success with clear failure indication

---

### 3.2 Rolling Strategy

#### TC-BCH-010: Rolling Update Success
**Description**: Update agents in sequential batches  
**Preconditions**: Group with 6 agents

**Test Steps**:
1. POST `/api/v1/config/batch` with strategy=rolling, batch_size=2
2. Verify batch 1 (agents 1-2) updated first
3. Verify pause between batches
4. Verify batch 2 (agents 3-4) updated
5. Verify batch 3 (agents 5-6) updated
6. Verify total time includes pauses

**Test Data**:
```json
{
  "group_id": "group-uuid",
  "raw_content": "...",
  "strategy": "rolling",
  "batch_size": 2,
  "pause_between_batches_seconds": 30
}
```

**Expected Result**: Sequential batch updates with pauses

---

#### TC-BCH-011: Rolling Update Stops on Failure
**Description**: Rolling update halts when batch fails  
**Preconditions**: 
- Group with 6 agents
- Agent-3 will fail validation

**Test Steps**:
1. POST `/api/v1/config/batch` with rollback_on_fail=true
2. Batch 1 (agents 1-2) succeeds
3. Batch 2 (agents 3-4) fails (agent-3 error)
4. Verify batch 3 never started
5. Verify agents 1-2 rolled back
6. Verify batch status = rolled_back

**Expected Result**: Update halted and rolled back on failure

---

#### TC-BCH-012: Rolling Update Continue on Failure
**Description**: Rolling update continues despite failures  
**Preconditions**: 
- Group with 6 agents
- rollback_on_fail=false

**Test Steps**:
1. POST `/api/v1/config/batch` with rollback_on_fail=false
2. Batch 2 has failure
3. Verify batch 3 still executes
4. Verify batch status = partial_failure
5. Verify failed agents identified

**Expected Result**: Update continues, failures recorded

---

### 3.3 Canary Strategy

#### TC-BCH-020: Canary Update Success
**Description**: Canary deployment with successful validation  
**Preconditions**: Group with 10 agents

**Test Steps**:
1. POST `/api/v1/config/batch` with strategy=canary
2. Verify 10% (1 agent) updated first
3. Wait for canary_duration
4. Verify health metrics checked
5. Verify remaining 90% updated
6. Verify batch status = completed

**Test Data**:
```json
{
  "group_id": "group-uuid",
  "raw_content": "...",
  "strategy": "canary",
  "canary_percentage": 10,
  "canary_duration_seconds": 300
}
```

**Expected Result**: Successful canary deployment

---

#### TC-BCH-021: Canary Rollback on Metrics Failure
**Description**: Canary rolled back due to health check failure  
**Preconditions**: 
- Group with 10 agents
- Canary config causes error rate spike

**Test Steps**:
1. POST `/api/v1/config/batch` with success criteria
2. Canary agent updated
3. Metrics show error_rate > threshold
4. Verify canary agent rolled back
5. Verify remaining agents not updated
6. Verify batch status = rolled_back

**Test Data**:
```json
{
  "strategy": "canary",
  "success_criteria": ["error_rate < 1%", "latency_p99 < 500ms"]
}
```

**Expected Result**: Automatic rollback on failed metrics

---

### 3.4 Batch Operations

#### TC-BCH-030: Get Batch Status
**Description**: Monitor batch update progress  
**Preconditions**: Batch update in progress

**Test Steps**:
1. POST `/api/v1/config/batch` (starts async)
2. GET `/api/v1/config/batch/{id}` repeatedly
3. Verify progress updates (current_batch, completed_count)
4. Verify final status when complete

**Expected Result**: Real-time progress tracking

---

#### TC-BCH-031: Cancel Batch Update
**Description**: Cancel in-progress batch update  
**Preconditions**: Rolling batch update in progress

**Test Steps**:
1. Start rolling update with 5 batches
2. After batch 2, POST `/api/v1/config/batch/{id}/cancel`
3. Verify current batch completes
4. Verify subsequent batches not started
5. Verify batch status = cancelled

**Expected Result**: Batch cancelled gracefully

---

#### TC-BCH-032: Rollback Completed Batch
**Description**: Rollback all changes from completed batch  
**Preconditions**: 
- Batch update completed successfully
- Backups exist for all agents

**Test Steps**:
1. POST `/api/v1/config/batch/{id}/rollback`
2. Verify all agents restore from backup
3. Verify all agents reload
4. Verify batch status = rolled_back

**Expected Result**: All agents restored to pre-update state

---

### 3.5 Dry Run and Validation

#### TC-BCH-040: Dry Run Batch Update
**Description**: Preview batch update without applying  
**Preconditions**: Group with agents

**Test Steps**:
1. POST `/api/v1/config/batch` with dry_run=true
2. Verify no configs actually changed
3. Verify response shows what would happen
4. Verify validation results for each agent

**Expected Result**: Preview without changes

---

#### TC-BCH-041: Validate Only
**Description**: Validate config syntax without applying  
**Preconditions**: Group with agents

**Test Steps**:
1. POST `/api/v1/config/batch` with validate_only=true
2. Verify nginx -t run on all agents
3. Verify validation results returned
4. Verify no config changes made

**Expected Result**: Syntax validation only

---

---

## 4. Configuration Templates

### 4.1 Template CRUD

#### TC-TPL-001: Create Template
**Description**: Create new configuration template  
**Preconditions**: User has write permission

**Test Steps**:
1. POST `/api/v1/config/templates` with template data
2. Verify template created
3. Verify variables extracted/validated
4. Verify template appears in list

**Test Data**:
```json
{
  "project_id": "project-uuid",
  "name": "Standard Web Server",
  "template_type": "nginx_main_conf",
  "content": "worker_processes {{worker_count}}; ...",
  "variables": [
    {"name": "worker_count", "required": true, "default": "auto"}
  ]
}
```

**Expected Result**: Template created successfully

---

#### TC-TPL-002: Render Template with Variables
**Description**: Generate config from template with variable substitution  
**Preconditions**: Template exists with variables

**Test Steps**:
1. POST `/api/v1/config/templates/{id}/render`
2. Provide variable values
3. Verify all {{variables}} replaced
4. Verify output is valid nginx config

**Test Data**:
```json
{
  "variables": {
    "worker_count": "4",
    "server_name": "api.example.com"
  }
}
```

**Expected Result**: Fully rendered config

---

#### TC-TPL-003: Render Template Missing Required Variable
**Description**: Attempt to render without required variable  
**Preconditions**: Template with required variable

**Test Steps**:
1. POST `/api/v1/config/templates/{id}/render` without required var
2. Verify response status 400
3. Verify error indicates missing variable

**Expected Result**: Validation error for missing variable

---

#### TC-TPL-004: Template with Conditionals
**Description**: Template with conditional sections  
**Preconditions**: Template with {{#if}} blocks

**Test Steps**:
1. Render with rate_limit_enabled=true
2. Verify rate limit config included
3. Render with rate_limit_enabled=false
4. Verify rate limit config excluded

**Expected Result**: Conditionals evaluated correctly

---

### 4.2 Template Scope

#### TC-TPL-010: Project-level Template
**Description**: Template available to all environments in project  
**Preconditions**: Template with project_id set

**Test Steps**:
1. Verify template visible in all project environments
2. Apply template to agents in different environments
3. Verify consistent behavior

**Expected Result**: Template works across project

---

#### TC-TPL-011: Environment-specific Template
**Description**: Template only for specific environment  
**Preconditions**: Template with environment_id set

**Test Steps**:
1. Verify template only visible in that environment
2. Attempt to apply to different environment
3. Verify rejection

**Expected Result**: Template scoped to environment

---

---

## 5. Maintenance Page System

### 5.1 Custom Maintenance Page Upload

#### TC-MNT-001: Upload HTML Maintenance Page
**Description**: Upload custom HTML maintenance page  
**Preconditions**: User has write permission

**Test Steps**:
1. POST `/api/v1/maintenance/templates` with HTML content
2. Verify template created
3. Verify HTML stored correctly
4. Verify preview URL generated

**Test Data**:
```json
{
  "project_id": "project-uuid",
  "name": "Custom Maintenance",
  "html_content": "<!DOCTYPE html><html>...</html>",
  "css_content": "body { background: #f0f0f0; }"
}
```

**Expected Result**: Template uploaded and stored

---

#### TC-MNT-002: Upload Maintenance Page with Assets
**Description**: Upload maintenance page with images/fonts  
**Preconditions**: User has write permission

**Test Steps**:
1. POST `/api/v1/maintenance/templates` with assets
2. Verify assets stored as base64
3. Verify assets retrievable
4. Verify preview includes assets

**Test Data**:
```json
{
  "name": "Branded Maintenance",
  "html_content": "<html><body><img src='logo.png'></body></html>",
  "assets": {
    "logo.png": "iVBORw0KGgoAAAANSUhEUgAAA..."
  }
}
```

**Expected Result**: Assets stored and served correctly

---

#### TC-MNT-003: Upload ZIP Package
**Description**: Upload ZIP containing HTML, CSS, and assets  
**Preconditions**: User has write permission

**Test Steps**:
1. POST `/api/v1/maintenance/templates/upload` with multipart ZIP
2. Verify ZIP extracted
3. Verify index.html found and stored
4. Verify CSS linked correctly
5. Verify assets extracted

**Expected Result**: ZIP package processed correctly

---

#### TC-MNT-004: Preview Maintenance Page
**Description**: Preview maintenance page before deployment  
**Preconditions**: Template exists

**Test Steps**:
1. GET `/api/v1/maintenance/templates/{id}/preview`
2. Verify HTML rendered
3. Verify variables substituted with sample values
4. Verify assets displayed

**Expected Result**: Accurate preview rendered

---

### 5.2 Template Selection

#### TC-MNT-010: List Available Templates
**Description**: Get list of maintenance templates  
**Preconditions**: Multiple templates exist

**Test Steps**:
1. GET `/api/v1/maintenance/templates`
2. Verify built-in templates included
3. Verify custom templates included
4. Verify thumbnails/previews available

**Expected Result**: All available templates listed

---

#### TC-MNT-011: Select Template When Enabling Maintenance
**Description**: Choose specific template for maintenance mode  
**Preconditions**: Multiple templates exist

**Test Steps**:
1. POST `/api/v1/maintenance` with template_id
2. Verify selected template deployed
3. Visit maintenance URL
4. Verify correct template displayed

**Test Data**:
```json
{
  "action": "enable",
  "scope": "environment",
  "scope_id": "env-uuid",
  "template_id": "custom-template-uuid"
}
```

**Expected Result**: Selected template used

---

#### TC-MNT-012: Template with Variables
**Description**: Deploy template with custom variable values  
**Preconditions**: Template with variables

**Test Steps**:
1. POST `/api/v1/maintenance` with template_id and variables
2. Verify variables substituted in deployed page
3. Visit maintenance URL
4. Verify custom values displayed

**Test Data**:
```json
{
  "action": "enable",
  "template_id": "template-uuid",
  "variables": {
    "company_name": "Acme Corp",
    "support_email": "help@acme.com",
    "estimated_end": "6:00 PM UTC"
  }
}
```

**Expected Result**: Variables rendered in page

---

### 5.3 Maintenance Scheduling

#### TC-MNT-020: Enable Immediate Maintenance
**Description**: Enable maintenance mode immediately  
**Preconditions**: Group/environment exists

**Test Steps**:
1. POST `/api/v1/maintenance` with schedule_type=immediate
2. Verify maintenance enabled instantly
3. Verify all affected agents return 503
4. Verify maintenance page displayed

**Expected Result**: Immediate maintenance activation

---

#### TC-MNT-021: Schedule Future Maintenance
**Description**: Schedule maintenance to start later  
**Preconditions**: Group exists

**Test Steps**:
1. POST `/api/v1/maintenance` with scheduled_start in future
2. Verify maintenance state created but not enabled
3. Wait until scheduled_start
4. Verify maintenance auto-enables
5. Verify agents return 503

**Test Data**:
```json
{
  "action": "schedule",
  "scope": "group",
  "scope_id": "group-uuid",
  "schedule_type": "scheduled",
  "scheduled_start": "2026-03-02T14:00:00Z",
  "scheduled_end": "2026-03-02T18:00:00Z"
}
```

**Expected Result**: Maintenance activates at scheduled time

---

#### TC-MNT-022: Auto-Disable at Scheduled End
**Description**: Maintenance auto-disables at end time  
**Preconditions**: Maintenance enabled with scheduled_end

**Test Steps**:
1. Enable maintenance with scheduled_end
2. Wait until scheduled_end time
3. Verify maintenance auto-disables
4. Verify agents return normal responses
5. Verify notification sent (if configured)

**Expected Result**: Automatic maintenance end

---

#### TC-MNT-023: Recurring Maintenance Schedule
**Description**: Set up recurring maintenance window  
**Preconditions**: Group exists

**Test Steps**:
1. POST `/api/v1/maintenance` with recurrence_rule
2. Wait for next occurrence
3. Verify maintenance auto-enables
4. Wait for duration to pass
5. Verify maintenance auto-disables
6. Verify next occurrence scheduled

**Test Data**:
```json
{
  "action": "schedule",
  "schedule_type": "recurring",
  "recurrence_rule": "0 2 * * 0",
  "scheduled_end_offset_minutes": 120,
  "timezone": "America/New_York"
}
```

**Expected Result**: Recurring maintenance works

---

#### TC-MNT-024: Cancel Scheduled Maintenance
**Description**: Cancel pending scheduled maintenance  
**Preconditions**: Maintenance scheduled for future

**Test Steps**:
1. POST `/api/v1/maintenance` with action=cancel_schedule
2. Verify scheduled maintenance cancelled
3. Wait past original scheduled_start
4. Verify maintenance never enabled

**Expected Result**: Scheduled maintenance cancelled

---

#### TC-MNT-025: Modify Scheduled Maintenance
**Description**: Change schedule of pending maintenance  
**Preconditions**: Maintenance scheduled for future

**Test Steps**:
1. PUT `/api/v1/maintenance/{id}` with new times
2. Verify schedule updated
3. Verify maintenance activates at new time

**Expected Result**: Schedule modified successfully

---

### 5.4 Maintenance Scopes

#### TC-MNT-030: Agent-Level Maintenance
**Description**: Enable maintenance for single agent  
**Preconditions**: Agent online

**Test Steps**:
1. POST `/api/v1/maintenance` with scope=agent
2. Verify only that agent returns 503
3. Verify other agents in group respond normally

**Expected Result**: Single agent in maintenance

---

#### TC-MNT-031: Group-Level Maintenance
**Description**: Enable maintenance for entire group  
**Preconditions**: Group with 3 agents

**Test Steps**:
1. POST `/api/v1/maintenance` with scope=group
2. Verify all 3 agents return 503
3. Verify agents in other groups respond normally

**Expected Result**: Group-wide maintenance

---

#### TC-MNT-032: Environment-Level Maintenance
**Description**: Enable maintenance for entire environment  
**Preconditions**: Environment with multiple groups

**Test Steps**:
1. POST `/api/v1/maintenance` with scope=environment
2. Verify all agents in environment return 503
3. Verify other environments unaffected

**Expected Result**: Environment-wide maintenance

---

#### TC-MNT-033: Site-Level Maintenance
**Description**: Enable maintenance for specific site only  
**Preconditions**: Agent serving multiple sites

**Test Steps**:
1. POST `/api/v1/maintenance` with scope=site, site_filter="api.example.com"
2. Verify api.example.com returns 503
3. Verify www.example.com responds normally

**Expected Result**: Site-specific maintenance

---

#### TC-MNT-034: Location-Level Maintenance
**Description**: Enable maintenance for specific location  
**Preconditions**: Site with multiple locations

**Test Steps**:
1. POST `/api/v1/maintenance` with scope=location, location_filter="/api/v2"
2. Verify /api/v2/* returns 503
3. Verify /api/v1/* responds normally
4. Verify / responds normally

**Expected Result**: Location-specific maintenance

---

### 5.5 Bypass Rules

#### TC-MNT-040: Bypass by IP Address
**Description**: Specific IPs bypass maintenance  
**Preconditions**: Maintenance enabled

**Test Steps**:
1. Enable maintenance with bypass_ips=["10.0.0.1"]
2. Request from 10.0.0.1 - verify normal response
3. Request from 10.0.0.2 - verify 503 maintenance page

**Expected Result**: Bypass IPs get normal response

---

#### TC-MNT-041: Bypass by IP Range (CIDR)
**Description**: IP range bypasses maintenance  
**Preconditions**: Maintenance enabled

**Test Steps**:
1. Enable maintenance with bypass_ips=["192.168.1.0/24"]
2. Request from 192.168.1.50 - verify normal response
3. Request from 192.168.2.50 - verify 503

**Expected Result**: CIDR range bypasses maintenance

---

#### TC-MNT-042: Bypass by Header
**Description**: Requests with specific header bypass  
**Preconditions**: Maintenance enabled

**Test Steps**:
1. Enable maintenance with bypass_headers={"X-Bypass": "secret123"}
2. Request with header - verify normal response
3. Request without header - verify 503
4. Request with wrong value - verify 503

**Expected Result**: Correct header bypasses maintenance

---

#### TC-MNT-043: Bypass by Cookie
**Description**: Requests with specific cookie bypass  
**Preconditions**: Maintenance enabled

**Test Steps**:
1. Enable maintenance with bypass_cookies={"maintenance_bypass": "token123"}
2. Request with cookie - verify normal response
3. Request without cookie - verify 503

**Expected Result**: Correct cookie bypasses maintenance

---

### 5.6 Maintenance Drift Detection

#### TC-MNT-050: Detect Maintenance Page Drift in Group
**Description**: Detect different maintenance pages across group  
**Preconditions**: 
- Group with 3 agents
- Maintenance enabled on all
- Agent-2 has different maintenance page

**Test Steps**:
1. POST `/api/v1/drift/check` with check_types=["maintenance_page"]
2. Verify agent-2 flagged as drifted
3. Verify diff shows page differences

**Expected Result**: Maintenance page drift detected

---

#### TC-MNT-051: Detect Inconsistent Maintenance State
**Description**: Detect when maintenance enabled on some agents but not others  
**Preconditions**: 
- Group with 3 agents
- Maintenance enabled on 2, disabled on 1

**Test Steps**:
1. POST `/api/v1/drift/check` for group
2. Verify inconsistent maintenance state detected
3. Verify which agents have maintenance enabled/disabled

**Expected Result**: Maintenance state inconsistency detected

---

---

## 6. Certificate Management

### 6.1 Certificate Upload

#### TC-CRT-001: Upload Valid Certificate
**Description**: Upload PEM certificate and key  
**Preconditions**: Valid cert/key pair

**Test Steps**:
1. POST `/api/v1/certificates` with cert and key
2. Verify certificate parsed correctly
3. Verify domain extracted
4. Verify expiry date extracted
5. Verify SAN domains extracted

**Test Data**:
```json
{
  "domain": "api.example.com",
  "cert_content": "-----BEGIN CERTIFICATE-----...",
  "key_content": "-----BEGIN PRIVATE KEY-----...",
  "cert_type": "commercial"
}
```

**Expected Result**: Certificate stored in inventory

---

#### TC-CRT-002: Upload Certificate with Chain
**Description**: Upload cert with intermediate chain  
**Preconditions**: Cert with intermediate certificates

**Test Steps**:
1. POST `/api/v1/certificates` with chain_content
2. Verify full chain stored
3. Verify chain deployed with cert

**Expected Result**: Full chain stored and deployable

---

#### TC-CRT-003: Upload Mismatched Cert/Key
**Description**: Reject certificate that doesn't match key  
**Preconditions**: Mismatched cert and key

**Test Steps**:
1. POST `/api/v1/certificates` with mismatched pair
2. Verify response status 400
3. Verify error indicates mismatch

**Expected Result**: Upload rejected with error

---

#### TC-CRT-004: Upload Expired Certificate
**Description**: Handle upload of expired certificate  
**Preconditions**: Expired certificate

**Test Steps**:
1. POST `/api/v1/certificates` with expired cert
2. Verify warning returned (or rejection based on policy)
3. If accepted, verify marked as expired

**Expected Result**: Appropriate handling of expired cert

---

### 6.2 Certificate Deployment

#### TC-CRT-010: Deploy Certificate to Single Agent
**Description**: Deploy cert to specific agent  
**Preconditions**: Certificate in inventory, agent online

**Test Steps**:
1. POST `/api/v1/certificates/{id}/deploy` with agent_id
2. Verify cert files written to agent
3. Verify nginx reloaded
4. Verify HTTPS working with new cert

**Test Data**:
```json
{
  "agent_ids": ["agent-001"],
  "reload_nginx": true,
  "backup_existing": true
}
```

**Expected Result**: Certificate deployed and active

---

#### TC-CRT-011: Deploy Certificate to Group
**Description**: Deploy cert to all agents in group  
**Preconditions**: Certificate in inventory, group with 3 agents

**Test Steps**:
1. POST `/api/v1/certificates/{id}/deploy` with group_id
2. Verify cert deployed to all 3 agents
3. Verify all agents reloaded
4. Verify all agents serving new cert

**Expected Result**: Certificate deployed to entire group

---

#### TC-CRT-012: Deploy with Backup
**Description**: Backup existing cert before deployment  
**Preconditions**: Agent has existing certificate

**Test Steps**:
1. POST `/api/v1/certificates/{id}/deploy` with backup_existing=true
2. Verify old cert backed up
3. Verify new cert deployed
4. Verify backup accessible for rollback

**Expected Result**: Old cert backed up, new cert active

---

### 6.3 Certificate Drift Detection

#### TC-CRT-020: Detect Certificate Drift
**Description**: Detect different certs across group  
**Preconditions**: 
- Group with 3 agents
- Agent-2 has different cert for same domain

**Test Steps**:
1. POST `/api/v1/drift/check` with check_types=["ssl_certs"]
2. Verify agent-2 flagged for cert drift
3. Verify different cert hashes shown

**Expected Result**: Certificate drift detected

---

#### TC-CRT-021: Detect Missing Certificate
**Description**: Detect agent missing certificate  
**Preconditions**: 
- Group with 3 agents
- Agent-3 missing cert that others have

**Test Steps**:
1. POST `/api/v1/drift/check` with check_types=["ssl_certs"]
2. Verify agent-3 flagged as missing cert
3. Verify status = "missing"

**Expected Result**: Missing certificate detected

---

#### TC-CRT-022: Detect Expiry Date Mismatch
**Description**: Same cert content but different files  
**Preconditions**: 
- Group with agents
- Agent-2 has cert with different expiry (renewed version)

**Test Steps**:
1. POST `/api/v1/drift/check` with check_types=["ssl_certs"]
2. Verify expiry date difference detected
3. Verify which agent has newer cert

**Expected Result**: Expiry mismatch detected

---

### 6.4 Certificate Monitoring

#### TC-CRT-030: List Expiring Certificates
**Description**: Get certificates expiring soon  
**Preconditions**: Certificates with various expiry dates

**Test Steps**:
1. GET `/api/v1/certificates/expiring?days=30`
2. Verify certs expiring within 30 days returned
3. Verify sorted by expiry date
4. Verify days_until_expiry calculated

**Expected Result**: Expiring certificates listed

---

#### TC-CRT-031: Expiry Notification
**Description**: Receive notification for expiring cert  
**Preconditions**: 
- Certificate expiring in 7 days
- Notification configured

**Test Steps**:
1. Verify notification sent at 30 day mark
2. Verify notification sent at 14 day mark
3. Verify notification sent at 7 day mark
4. Verify notification includes cert details

**Expected Result**: Expiry notifications sent

---

---

## 7. Environment Comparison

### 7.1 Basic Comparison

#### TC-CMP-001: Compare Two Environments
**Description**: Compare configs between staging and production  
**Preconditions**: 
- Staging environment with agents
- Production environment with agents

**Test Steps**:
1. POST `/api/v1/environments/compare`
2. Verify comparison categories returned
3. Verify same/different counts accurate
4. Verify source_only and target_only items identified

**Test Data**:
```json
{
  "source_environment_id": "staging-uuid",
  "target_environment_id": "production-uuid",
  "compare_types": ["nginx_main_conf", "ssl_certs"]
}
```

**Expected Result**: Comprehensive comparison report

---

#### TC-CMP-002: Compare with Diff Content
**Description**: Get actual diff between environments  
**Preconditions**: Environments with different configs

**Test Steps**:
1. POST `/api/v1/environments/compare` with include_diff_content=true
2. Verify diff field populated for different items
3. Verify unified diff format

**Expected Result**: Diff content included in response

---

#### TC-CMP-003: Compare Environments with Group Mapping
**Description**: Compare specific groups across environments  
**Preconditions**: 
- Staging has "web-tier" group
- Production has "web-tier" group

**Test Steps**:
1. POST `/api/v1/environments/compare` with group_mapping
2. Verify groups compared correctly
3. Verify unmapped groups handled appropriately

**Test Data**:
```json
{
  "source_environment_id": "staging-uuid",
  "target_environment_id": "production-uuid",
  "group_mapping": {
    "staging-web-tier-uuid": "prod-web-tier-uuid"
  }
}
```

**Expected Result**: Mapped groups compared

---

### 7.2 Comparison Categories

#### TC-CMP-010: Compare Nginx Configs
**Description**: Compare nginx.conf across environments  
**Preconditions**: Different nginx.conf in each environment

**Test Steps**:
1. Compare with compare_types=["nginx_main_conf"]
2. Verify config differences highlighted
3. Verify severity assessed (critical for security settings)

**Expected Result**: Config differences identified

---

#### TC-CMP-011: Compare SSL Certificates
**Description**: Compare certificate deployment  
**Preconditions**: Different certs in each environment

**Test Steps**:
1. Compare with compare_types=["ssl_certs"]
2. Verify cert differences by domain
3. Verify expiry date differences noted

**Expected Result**: Certificate differences identified

---

#### TC-CMP-012: Compare Maintenance State
**Description**: Compare maintenance configuration  
**Preconditions**: Different maintenance settings

**Test Steps**:
1. Compare with compare_types=["maintenance"]
2. Verify maintenance state differences
3. Verify maintenance page differences

**Expected Result**: Maintenance differences identified

---

---

## 8. Site/Location Configuration

### 8.1 Site Updates

#### TC-SLC-001: Update Site Config on Single Agent
**Description**: Update server block on one agent  
**Preconditions**: Agent with existing site config

**Test Steps**:
1. POST `/api/v1/sites/update` with target=agent
2. Verify config updated
3. Verify nginx reloaded
4. Verify site responding correctly

**Test Data**:
```json
{
  "target": "agent",
  "target_id": "agent-001",
  "server_name": "api.example.com",
  "action": "update",
  "config": {
    "proxy_pass": "http://new-backend:8080"
  }
}
```

**Expected Result**: Site config updated on agent

---

#### TC-SLC-002: Update Site Config on Group
**Description**: Update server block on all group agents  
**Preconditions**: Group with 3 agents

**Test Steps**:
1. POST `/api/v1/sites/update` with target=group
2. Verify config updated on all agents
3. Verify all agents reloaded
4. Verify consistent config across group

**Expected Result**: Site config updated on group

---

### 8.2 Location Updates

#### TC-SLC-010: Add New Location
**Description**: Add new location block to site  
**Preconditions**: Site exists without /api/v2 location

**Test Steps**:
1. POST `/api/v1/sites/update` with action=create
2. Verify location block added
3. Verify nginx reloaded
4. Verify new location responding

**Test Data**:
```json
{
  "target": "group",
  "target_id": "group-uuid",
  "server_name": "api.example.com",
  "location_path": "/api/v2",
  "action": "create",
  "config": {
    "proxy_pass": "http://backend-v2:8080",
    "proxy_headers": {
      "X-Forwarded-For": "$proxy_add_x_forwarded_for"
    }
  }
}
```

**Expected Result**: New location added

---

#### TC-SLC-011: Update Existing Location
**Description**: Modify existing location block  
**Preconditions**: Location /api exists

**Test Steps**:
1. POST `/api/v1/sites/update` with action=update
2. Verify location block modified
3. Verify nginx reloaded
4. Verify changes active

**Expected Result**: Location updated

---

#### TC-SLC-012: Delete Location
**Description**: Remove location block  
**Preconditions**: Location /api/deprecated exists

**Test Steps**:
1. POST `/api/v1/sites/update` with action=delete
2. Verify location block removed
3. Verify nginx reloaded
4. Verify location returns 404

**Expected Result**: Location removed

---

#### TC-SLC-013: Add Rate Limiting to Location
**Description**: Configure rate limiting on location  
**Preconditions**: Location exists without rate limiting

**Test Steps**:
1. POST `/api/v1/sites/update` with rate_limit config
2. Verify rate limit zone created
3. Verify limit_req directive added
4. Test rate limiting works

**Test Data**:
```json
{
  "location_path": "/api",
  "action": "update",
  "config": {
    "rate_limit": {
      "zone": "api_limit",
      "rate": "10r/s",
      "burst": 20,
      "no_delay": true
    }
  }
}
```

**Expected Result**: Rate limiting active

---

---

## 9. Integration Tests

### 9.1 End-to-End Workflows

#### TC-INT-001: Full Drift Detection and Resolution Workflow
**Description**: Complete drift detection to resolution flow  
**Preconditions**: Group with intentional drift

**Test Steps**:
1. Trigger drift detection
2. Review drift report
3. Generate diff for drifted agents
4. Resolve drift (sync to baseline)
5. Verify all agents in sync
6. Verify nginx functioning on all agents

**Expected Result**: Complete workflow successful

---

#### TC-INT-002: Scheduled Maintenance with Custom Page
**Description**: Full maintenance scheduling workflow  
**Preconditions**: Group exists

**Test Steps**:
1. Upload custom maintenance template
2. Schedule maintenance for future time
3. Wait for scheduled start
4. Verify maintenance page displayed
5. Wait for scheduled end
6. Verify normal operation resumed
7. Verify notifications sent

**Expected Result**: Full scheduled maintenance workflow

---

#### TC-INT-003: Certificate Renewal and Deployment
**Description**: Renew and deploy certificate across group  
**Preconditions**: Group with expiring certificate

**Test Steps**:
1. Upload renewed certificate
2. Deploy to all group agents
3. Verify HTTPS working
4. Run drift check to verify consistency
5. Update certificate inventory

**Expected Result**: Certificate renewed across group

---

#### TC-INT-004: Rolling Update with Drift Check
**Description**: Perform rolling update then verify consistency  
**Preconditions**: Group with 5 agents

**Test Steps**:
1. Start rolling config update
2. Monitor batch progress
3. After completion, trigger drift check
4. Verify all agents in sync
5. Verify new config active everywhere

**Expected Result**: Update and consistency verified

---

### 9.2 Failure Recovery

#### TC-INT-010: Recover from Failed Batch Update
**Description**: Handle and recover from partial batch failure  
**Preconditions**: Group where one agent will fail

**Test Steps**:
1. Start batch update
2. One agent fails validation
3. Rollback triggered
4. Verify successful agents rolled back
5. Verify failed agent unchanged
6. Verify all agents operational

**Expected Result**: Clean recovery from failure

---

#### TC-INT-011: Recover from Maintenance Stuck State
**Description**: Handle maintenance that fails to disable  
**Preconditions**: Maintenance enabled, agent offline

**Test Steps**:
1. Enable maintenance on group
2. One agent goes offline
3. Attempt to disable maintenance
4. Verify online agents disabled
5. Agent comes back online
6. Verify maintenance disabled on reconnect

**Expected Result**: Graceful handling of offline agent

---

---

## 10. Performance Tests

### 10.1 Scalability

#### TC-PRF-001: Drift Check with 100 Agents
**Description**: Verify drift check performance at scale  
**Preconditions**: Group with 100 agents

**Test Steps**:
1. Trigger drift check
2. Measure time to complete
3. Verify all 100 agents checked
4. Verify response time < 30 seconds

**Expected Result**: Drift check completes in reasonable time

---

#### TC-PRF-002: Batch Update 50 Agents
**Description**: Verify batch update performance  
**Preconditions**: Group with 50 agents

**Test Steps**:
1. Start parallel batch update
2. Measure time to complete
3. Verify all agents updated
4. Verify response time < 60 seconds

**Expected Result**: Batch update completes efficiently

---

#### TC-PRF-003: Large Maintenance Template
**Description**: Handle large maintenance page  
**Preconditions**: Template with multiple images (5MB total)

**Test Steps**:
1. Upload large template
2. Deploy to 10 agents
3. Verify deployment completes
4. Verify page loads quickly

**Expected Result**: Large template handled correctly

---

### 10.2 Concurrency

#### TC-PRF-010: Concurrent Drift Checks
**Description**: Multiple drift checks simultaneously  
**Preconditions**: 5 groups

**Test Steps**:
1. Trigger drift check on all 5 groups simultaneously
2. Verify all complete successfully
3. Verify no race conditions
4. Verify results accurate

**Expected Result**: Concurrent checks work correctly

---

#### TC-PRF-011: Concurrent Config Updates
**Description**: Update different groups simultaneously  
**Preconditions**: 3 groups

**Test Steps**:
1. Start batch update on all 3 groups
2. Verify updates don't interfere
3. Verify all complete successfully

**Expected Result**: Concurrent updates isolated

---

---

## 11. Security Tests

### 11.1 Authorization

#### TC-SEC-001: Group Operations Require Permission
**Description**: Verify RBAC for group operations  
**Preconditions**: User with read-only permission

**Test Steps**:
1. Attempt to create group - verify 403
2. Attempt to delete group - verify 403
3. Attempt to add agent - verify 403
4. Read group - verify 200 (allowed)

**Expected Result**: Write operations blocked for read-only user

---

#### TC-SEC-002: Cross-Project Access Denied
**Description**: Verify project isolation  
**Preconditions**: User has access to Project A only

**Test Steps**:
1. Attempt to access Project B group - verify 403
2. Attempt drift check on Project B - verify 403
3. Attempt maintenance on Project B - verify 403

**Expected Result**: Cross-project access denied

---

#### TC-SEC-003: Maintenance Bypass Token Security
**Description**: Verify bypass token cannot be brute-forced  
**Preconditions**: Maintenance with bypass header

**Test Steps**:
1. Attempt 100 wrong bypass values
2. Verify rate limiting applied
3. Verify no bypass granted
4. Verify correct token still works

**Expected Result**: Bypass tokens protected

---

### 11.2 Input Validation

#### TC-SEC-010: Config Injection Prevention
**Description**: Prevent malicious config injection  
**Preconditions**: Config update endpoint

**Test Steps**:
1. Submit config with shell injection attempt
2. Verify config rejected or sanitized
3. Verify no command execution

**Test Data**:
```
server_name example.com; } system('rm -rf /'); server {
```

**Expected Result**: Injection attempt blocked

---

#### TC-SEC-011: Template Variable Injection
**Description**: Prevent template variable injection  
**Preconditions**: Template with variables

**Test Steps**:
1. Provide variable with script injection
2. Verify output escaped
3. Verify no XSS possible

**Test Data**:
```json
{
  "variables": {
    "company_name": "<script>alert('xss')</script>"
  }
}
```

**Expected Result**: Script injection escaped

---

#### TC-SEC-012: Certificate Key Protection
**Description**: Verify private keys protected  
**Preconditions**: Certificate uploaded

**Test Steps**:
1. Attempt to retrieve private key via API - verify blocked
2. Verify key not in logs
3. Verify key not in error messages

**Expected Result**: Private keys not exposed

---

---

## Test Data Requirements

### Agents
- Minimum 10 test agents across 2 environments
- Agents with various nginx configurations
- Mix of online/offline agents for testing

### Certificates
- Valid certificate/key pairs (self-signed OK)
- Expired certificate for testing
- Certificate with SAN domains
- Mismatched cert/key for negative testing

### Templates
- Maintenance template with variables
- Maintenance template with assets
- Nginx config template with conditionals

### Configuration Files
- Standard nginx.conf for baseline
- Modified nginx.conf for drift testing
- Invalid nginx.conf for validation testing

---

## Test Environment Setup

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  gateway:
    image: avika-gateway:test
    environment:
      - DATABASE_URL=postgres://test:test@postgres/avika_test
    ports:
      - "8080:8080"
      - "9090:9090"
  
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=avika_test
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
  
  agent-1:
    image: avika-agent:test
    environment:
      - GATEWAYS=gateway:9090
      - AGENT_ID=test-agent-1
      - LABEL_group=test-group
  
  agent-2:
    image: avika-agent:test
    environment:
      - GATEWAYS=gateway:9090
      - AGENT_ID=test-agent-2
      - LABEL_group=test-group
  
  # ... more agents
```

---

## Automation Framework

### Recommended Tools
- **Go**: Native tests with `testing` package
- **API Tests**: Use `httptest` or external tool like `hurl`
- **E2E Tests**: Custom Go test suite with gRPC client
- **Load Tests**: `k6` or `vegeta`

### Test Organization
```
tests/
├── unit/
│   ├── drift_test.go
│   ├── batch_test.go
│   └── maintenance_test.go
├── integration/
│   ├── drift_integration_test.go
│   ├── batch_integration_test.go
│   └── maintenance_integration_test.go
├── e2e/
│   ├── workflow_test.go
│   └── scenarios/
├── performance/
│   ├── load_test.go
│   └── k6/
└── security/
    ├── auth_test.go
    └── injection_test.go
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: go test ./tests/unit/...
  
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - uses: actions/checkout@v4
      - run: go test ./tests/integration/...
  
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker-compose -f docker-compose.test.yml up -d
      - run: go test ./tests/e2e/...
```
