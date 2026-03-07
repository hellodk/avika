# Plan: PR #64 – Dynamic environments + agent config UI

**PR:** [Branch feature/dynamic-environments-agent-config-ui #64](https://github.com/hellodk/avika/pull/64)  
**Target:** `develop`  
**Commit:** `ebe3ed8` – feat: dynamic environments from agent config + agent config UI entry

---

## 1. Summary of changes

| Area | Change |
|------|--------|
| **Backend** | Stop creating default environments when a project is created. |
| **Backend** | Environments are created when agents connect using `AVIKA_LABEL_ENVIRONMENT` (new `EnsureEnvironment` flow). |
| **Backend** | `autoAssignAgentToEnvironment` uses `EnsureEnvironment` so missing env slugs are auto-created per project. |
| **Frontend** | Empty state when a project has no environments: message + link to Settings → Projects (for admins). |
| **Frontend** | Config (Settings icon) link from **Inventory** → `/agents/{id}/config`. |
| **Frontend** | “Edit agent config” link in **server detail** Settings tab → `/agents/{id}/config`. |
| **Docs** | `AGENT_CONFIGURATION.md` updated for dynamic environments; plan doc status. |

---

## 2. Review checklist

### Backend

- [ ] **Project creation** – `CreateDefaultEnvironments` is no longer called (or is gated) in `handlers_rbac.go` so new projects start with zero environments.
- [ ] **EnsureEnvironment** – New or updated helper that creates an environment by slug for a project if it doesn’t exist (idempotent).
- [ ] **autoAssignAgentToEnvironment** – Uses `EnsureEnvironment` for the env slug from labels (e.g. `AVIKA_LABEL_ENVIRONMENT`) so first agent with that label creates the env; assignment then proceeds as today.
- [ ] **Label name** – Confirm use of `AVIKA_LABEL_ENVIRONMENT` (or the exact label key) in code and docs.
- [ ] **Existing projects** – Behavior for projects that already have default environments (no regression; new flow only affects new envs / new agents).

### Frontend

- [ ] **Empty environments** – When `environments.length === 0` for the selected project, show a clear empty state with copy and a link to **Settings → Projects** (admin-only or role-aware if applicable).
- [ ] **Inventory → Agent config** – Each row (or actions menu) in Inventory has a Config/Settings icon linking to `/agents/{id}/config` (agent ID from server/agent mapping).
- [ ] **Server detail → Agent config** – In the server detail **Settings** tab, an “Edit agent config” (or similar) link to `/agents/{id}/config`; `id` is the current server’s agent ID.
- [ ] **Nav / layout** – No broken links; “Agent Config” in sidebar/layout still works for `/agents/[id]/config`.

### Docs

- [ ] **AGENT_CONFIGURATION.md** – Describes dynamic environments (envs created on first agent with label), and any plan/status doc updates mentioned in the PR.

### Tests & compatibility

- [ ] **Unit / integration** – Any tests that assumed default environments on project creation are updated or removed.
- [ ] **E2E** – If you have flows that depend on “production” (or other default) env existing, adjust or add data setup.
- [ ] **RBAC** – Permissions for creating environments (e.g. who can trigger EnsureEnvironment) are consistent with existing RBAC.

---

## 3. Merge strategy

- PR merges into **`develop`**, not `master`. Your current branch (`feature/dashboard-refresh-timepicker-themes`) is from `master`; to build on PR #64 you’d merge or rebase `develop` into your branch (or branch off `develop` after #64 is merged).
- After merge, run a quick smoke test: create project → no default envs; start agent with project + environment labels → env appears and agent is assigned; open Inventory and server detail → config links go to `/agents/{id}/config`.

---

## 4. Post-merge follow-ups (optional)

- **Settings → Projects** – If “create environment” is only in code and not in UI, consider adding a way for admins to create an environment manually (e.g. for pre-provisioning).
- **Onboarding** – Short note in UI or docs: “Environments are created when agents first connect with the environment label.”
- **Audit** – If you log project/create and environment/create, ensure EnsureEnvironment creates an audit entry when it creates an env.

---

## 5. Current codebase vs PR (reference)

On **master** (as of this plan):

- `cmd/gateway/handlers_rbac.go` still calls `CreateDefaultEnvironments(project.ID)` after project creation.
- `autoAssignAgentToEnvironment` in `main.go` looks up env by slug and returns if not found (no create).
- `/agents/[id]/config` exists; Inventory and server detail do not yet have the new Config / “Edit agent config” links described in the PR.

This plan assumes PR #64 introduces the backend and frontend changes above; adjust the checklist if the diff shows a different approach (e.g. different label names or API shape).
