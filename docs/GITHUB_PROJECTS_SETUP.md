# GitHub Projects: Setup and Onboarding

This guide explains how we trace development using **GitHub Projects** and how to onboard the Agent Features implementation plan.

## 1. Create the project

### Option A: GitHub web UI

1. In your repo, go to **Projects** → **New project** (or **Create project**).
2. Choose **Board** or **Table** (Board gives a Kanban; Table is good for a backlog list).
3. Name it e.g. **"Agent Features Implementation"**.
4. Set **Scope**: this repository (so issues from this repo can be added).

### Option B: GitHub CLI (after `gh auth login`)

```bash
gh project create --owner hellodk --title "Agent Features Implementation" --body "Tracks implementation plan: docs/implementation-plan-agent-features.md"
```

Note the **project number** (e.g. `1`) from the project URL: `https://github.com/orgs/hellodk/projects/1` or repo Projects tab.

---

## 2. Add custom fields (recommended)

In the project, add:

| Field name | Type        | Values / usage |
|------------|-------------|-----------------|
| **Phase**  | Single select | `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`, `Phase 5` |
| **Status** | Status (or Single select) | `Todo`, `In progress`, `Done` |

- **Phase** = which part of the implementation plan (see `docs/implementation-plan-agent-features.md`).
- **Status** = current state (replaces checkboxes in the doc).

Optional: **Priority**, **Target iteration**, or **Assignee**.

---

## 3. Onboard issues from the implementation plan

Each bullet in the implementation plan becomes one **issue**. Use either:

- **Manual**: Create issues from the list below, then add each to the project and set Phase + Status.
- **Script**: Run the script once you’re logged in and the project exists (see [Script usage](#script-usage)).

### Issue list (from implementation plan)

**Phase 1: NGINX restart/stop** (all Done)

| Title | Phase | Status | Notes |
|-------|--------|--------|--------|
| Agent: nginx -t before restart (TestConfig + Restart) | Phase 1 | Done | Implemented |
| Frontend API: RestartNginx / StopNginx for restart & stop | Phase 1 | Done | Implemented |
| Server detail: toast on restart/stop success or config test failure | Phase 1 | Done | Implemented |

**Phase 2: Log streaming SSE + filters**

| Title | Phase | Status |
|-------|--------|--------|
| Gateway: HTTP SSE endpoint GET /api/servers/{id}/logs (or keep gRPC + Next.js route) | Phase 2 | Todo |
| Next.js: GET /api/servers/[id]/logs/route.ts streaming from gateway GetLogs | Phase 2 | Todo |
| Filters: Extend LogRequest with time_range, status_codes, client_ip/cidr, header | Phase 2 | Todo |
| Frontend: EventSource + filter UI (time, status, IP/CIDR, header) | Phase 2 | Todo |

**Phase 3: Agent config persist, backup, restore, group apply**

| Title | Phase | Status |
|-------|--------|--------|
| Agent: Read/write avika-agent.conf; persist and optional restart | Phase 3 | Todo |
| Agent: Backup on write (keep 5), list backups, restore by name/index | Phase 3 | Todo |
| Gateway: HTTP API get/set agent config; backup list; restore; apply to group | Phase 3 | Todo |
| Frontend: Agent Settings – all keys, Save, Restore dropdown, Apply to group | Phase 3 | Todo |

**Phase 4: Drift for node**

| Title | Phase | Status |
|-------|--------|--------|
| Gateway: GET /api/servers/{agentId}/drift (per-group status) | Phase 4 | Done | Implemented |
| Frontend: Drift tab on server detail + inventory Drift column (badge/link) | Phase 4 | Done | Implemented |

**Phase 5: SSH and multi-interface VM**

| Title | Phase | Status |
|-------|--------|--------|
| Agent/Gateway: Report preferred SSH address for multi-interface VMs | Phase 5 | Todo |
| Frontend: Use preferred address in ssh:// link; in-browser terminal for VMs | Phase 5 | Todo |
| Encoding: agent_id with + encoded everywhere (encodeURIComponent); gateway decodes once | Phase 5 | Todo |

---

## 4. Link the doc to the project

- In the project **Description** or **README**, add:
  - **Implementation plan**: [docs/implementation-plan-agent-features.md](../implementation-plan-agent-features.md)
- In **issue/PR descriptions**, reference the doc and phase when relevant.

---

## 5. Script usage

A script creates all of the above issues (with labels) and can add them to your project.

**Prerequisites**

- GitHub CLI: `gh auth login` (include `project` scope if you add to project: `gh auth refresh -s project`).
- Create the project first (step 1) and note its **number** (e.g. `1` for first project).

**Run**

```bash
# From repo root. Replace PROJECT_NUMBER if you use a project.
export GITHUB_PROJECT_NUMBER=1   # optional: add issues to this project
./scripts/onboard-issues-to-project.sh
```

The script:

- Creates one issue per row in the table above (Phase 1–5).
- Adds labels: `phase-1` … `phase-5`, and `status-done` / `status-todo`.
- If `GITHUB_PROJECT_NUMBER` is set, adds each new issue to that project (you can then set Phase/Status in the UI or via automation).

You can re-run it after editing the script to add more items; it uses idempotent titles so you may want to skip creating duplicates (e.g. check with `gh issue list` first).

---

## 6. Ongoing workflow

- **New work**: Create an issue (or draft in the project), set **Phase** and **Status**, link PR when you open it.
- **Merged PR**: Mark the linked issue/project item as **Done**.
- **Planning**: Use Board view for “Todo / In progress / Done”, or Table grouped by **Phase** to match the implementation plan.

This keeps the implementation plan doc as the single source of scope and phases, and GitHub Projects as the live todo and traceability layer.
