# Plan: Dynamic Environments from Agent Config + Agent Config UI

**Status:** Implemented  
**Branch:** `feature/dynamic-environments-agent-config-ui`

---

## 1. Goals

1. **Dynamic environments per project**  
   The list of environments shown after a user selects a project must be driven by **values reported by avika-agent** (e.g. `LABEL_ENVIRONMENT` / `AVIKA_LABEL_ENVIRONMENT`), not by a fixed set (e.g. always dev/sit/prod). Different projects may have different environment sets (e.g. Project A: dev, prod; Project B: sit, uat, prod).

2. **Update agent config from the UI**  
   Ensure users can view and update agent configuration from the UI, with clear entry points from inventory/server views.

---

## 2. Current Behavior (Summary)

- **Projects & environments**
  - Projects and environments are stored in PostgreSQL (`projects`, `environments`).
  - When a **project is created**, `CreateDefaultEnvironments(projectID)` is called and creates three fixed environments: Production, Staging, Development (slugs: `production`, `staging`, `development`).
  - **List environments**: `GET /api/projects/:id/environments` → `ListEnvironments(projectID)` returns all rows in `environments` for that project.
  - **Auto-assignment**: On heartbeat, if agent labels include `project` and `environment`, the gateway looks up project by slug and environment by slug; if **environment does not exist**, assignment is skipped (logged only).

- **Frontend**
  - User selects a project → `fetchEnvironments()` calls `GET /api/projects/{id}/environments` → environment tabs show the returned list.
  - `EnvironmentTabs` returns `null` when `environments.length === 0`.

- **Agent config**
  - **Backend**: `GET/PATCH /api/agents/:id/config` (gateway) proxy to the agent’s gRPC `AgentConfigService` (GetAgentConfig / UpdateAgentConfig). Config includes gateway addresses, paths, labels, etc.
  - **Frontend**: Page at `app/agents/[id]/config/page.tsx` loads and saves via `GET/PATCH /api/agents/:id/config`. There is also `app/api/servers/[id]/config/route.ts` (different response shape). No prominent link from inventory/server detail to “Edit agent config”.

---

## 3. Proposed Behavior

### 3.1 Environments driven by agent config

- **Source of truth**: Environment slugs for a project come from **what agents report** (and, if desired, from environments manually created by admins). The system must not assume every project has the same fixed set (e.g. sit, dev, prod).
- **When an agent connects** with labels `project=<slug>`, `environment=<slug>`:
  - If the project exists but **no environment with that slug exists** for that project → **create** that environment (name derived from slug, e.g. "prod"), then assign the agent.
  - If the environment already exists → assign as today.
- **When a project is created**: **Do not** create default environments (Production, Staging, Development). Projects start with zero environments; environments appear when:
  - An admin creates one via **Settings → Projects → Add environment**, or
  - An agent connects with a new `environment` label (auto-creation).
- **List environments**: `GET /api/projects/:id/environments` continues to return all environments for that project. The list is now a mix of:
  - Manually created (admin),
  - Auto-created when the first agent reported that slug.
- **UI when a project has no environments**: Show a clear state instead of hiding the environment selector (e.g. message: “No environments yet. Connect agents with AVIKA_LABEL_PROJECT and AVIKA_LABEL_ENVIRONMENT set, or add an environment in Settings.”).

### 3.2 Agent config from the UI

- **Keep** existing agent config API and `agents/[id]/config` page as the main place to view and update agent config.
- **Add clear entry points** to “Edit agent config”:
  - From **inventory** (server/agent list): e.g. “Config” or “Edit config” action/link per agent that navigates to ` /agents/{id}/config`.
  - From **server/agent detail** page (if present): same link to ` /agents/{id}/config`.
- **Optional**: Ensure server detail and inventory use a single source of truth for “agent id” (e.g. same as used for config API) so the link is correct.

---

## 4. Implementation Plan

### Phase 1: Backend – dynamic environments

| Step | Task | Details |
|------|------|---------|
| 1.1 | Stop creating default environments on project creation | In `handlers_rbac.go` `handleCreateProject`, remove (or gate behind a config flag) the call to `CreateDefaultEnvironments(project.ID)`. Prefer removal so new projects start with zero environments. |
| 1.2 | Auto-create environment when agent reports new slug | In `main.go` `autoAssignAgentToEnvironment`, when `GetEnvironmentBySlug(project.ID, envSlug)` returns nil, call a new helper that creates the environment (e.g. `EnsureEnvironment(projectID, slug, name)` with name = humanized slug), then assign the agent. Use a sensible default color/sort_order; avoid duplicates (create only if not exists). |
| 1.3 | DB helper | Add `EnsureEnvironment(projectID, slug, name string) (*Environment, error)` in `rbac.go` (or re-use `CreateEnvironment` with “get or create” semantics) so auto-assign can create an environment once per (project, slug). |

**Backward compatibility**: Existing projects that already have default environments keep them. Only **new** projects get no default environments. Existing agents keep their assignments.

### Phase 2: Frontend – environment list and empty state

| Step | Task | Details |
|------|------|---------|
| 2.1 | No change to API contract | `GET /api/projects/:id/environments` response shape unchanged; it just returns the (now possibly agent-derived) list. |
| 2.2 | Empty state when no environments | In `environment-tabs.tsx` (or project-context): when `selectedProject` is set but `environments.length === 0`, show a short message and optional link to Settings, e.g. “No environments yet. Connect agents with AVIKA_LABEL_PROJECT and AVIKA_LABEL_ENVIRONMENT set, or add an environment in Settings → Projects.” Do not return `null` so the user understands the state. |
| 2.3 | Optional: refresh environments after project select | Ensure `fetchEnvironments()` is called when the user changes project (already the case in project-context). No change needed if already correct. |

### Phase 3: Agent config UI entry points

| Step | Task | Details |
|------|------|--------|
| 3.1 | Link from inventory to agent config | On the inventory page (server/agent list), for each agent row/card, add an action (e.g. “Config” or “Edit config”) that links to `/agents/{agent_id}/config`. Use the same `id` as used elsewhere for that agent (e.g. `agent_id` from list API). |
| 3.2 | Link from server/agent detail page | If there is a server/agent detail page (e.g. `servers/[id]` or `agents/[id]`), add a button or link “Edit agent config” → `/agents/{id}/config`. |
| 3.3 | Verify config API and page | Confirm `GET/PATCH /api/agents/:id/config` and `agents/[id]/config` work for the same `id` used in inventory and detail (no duplicate or conflicting routes). Document in the plan that “agent config” is edited at `agents/[id]/config`. |

### Phase 4: Documentation and tests

| Step | Task | Details |
|------|------|--------|
| 4.1 | Docs | Update or add a short section (e.g. in MULTI_TENANCY or AGENT_CONFIGURATION) explaining that (1) environments for a project can be created by admins or auto-created when agents connect with `environment` label, and (2) the list shown in the UI is that project’s environments (no fixed sit/dev/prod). |
| 4.2 | Tests | Add or extend: (1) Auto-assign when environment does not exist creates the environment then assigns. (2) New project has no environments until an agent connects or an admin adds one. (3) Optional: integration test for GET environments after agent-driven creation. |

---

## 5. Out of scope (for this plan)

- Changing how agents send labels (already supported via `AVIKA_LABEL_*` and config file `LABEL_*`).
- Removing or renaming existing environment slugs (e.g. production/staging/development) for existing projects.
- Bulk editing of agent config or config templates (future work).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Existing projects rely on default environments | Only new projects get no defaults; existing projects keep current behavior. |
| Typos in agent labels create many environments | Auto-created environments use the exact slug the agent sends. Operators can document expected values (e.g. dev, prod) and fix typos in agent config; optional future: admin UI to merge/rename environments. |
| Empty environment list confuses users | Clear empty state with message and link to Settings. |

---

## 7. Acceptance criteria

- When a user selects a project, the environment list is the set of environments for that project in the DB, which can include environments created when agents first reported that slug.
- New projects have no environments until an admin adds one or an agent connects with `project` + `environment` labels (and the new environment is auto-created).
- From inventory (and server detail if present), the user can open “Edit agent config” and land on the existing agent config page, which loads and saves via the existing API.
- No fixed assumption that every project has sit/dev/prod; each project’s environments are determined by config (and admin actions).

---

## 8. Review checklist

- [ ] Agree to stop creating default environments for new projects.
- [ ] Agree to auto-create environment on first agent connection when slug is missing for that project.
- [ ] Confirm empty-state copy and link to Settings.
- [ ] Confirm inventory (and detail) entry points for “Edit agent config” (path and label).
- [ ] Any product preference to keep “Create default environments” as an optional toggle (e.g. in project creation form) for backward compatibility or specific workflows.

---

*Once reviewed and approved, implementation will be done on branch `feature/dynamic-environments-agent-config-ui`.*
