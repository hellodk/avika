# Plan: Dynamic Environments, Agent Config UI, Log Streams, Exec (gRPC-only), and Drift by Project/Group

**Status:** Draft — for review  
**Branch:** (to be created after approval)  
**Reference:** [skyhook-io/radar](https://github.com/skyhook-io/radar) (log streams, pod exec patterns)

---

## 1. Goals

1. **Dynamic environments per project**  
   After the user selects a project, show only the **environments that exist for that project**, where environment set is driven by **values reported by avika-agent** (e.g. `AVIKA_LABEL_ENVIRONMENT`), not a fixed sit/dev/prod. Different projects can have different environment sets.

2. **Update agent config from the UI**  
   Users can view and update avika-agent config from the UI (per node), with changes **persisted to the agent’s config file** (avika-agent.conf).

3. **Log streaming and exec for nodes/pods**  
   - Log streams work for **all agents** (VMs and pods) from Inventory → server detail.  
   - Exec/terminal works **without SSH**, using **gRPC only** (gateway → agent mgmt port).  
   - Reliable **reachability**: gateway must use the **correct interface/address** to dial the agent (mgmt port).

4. **Drift detection for node from project/group**  
   Drift view for a server shows drift of **that node** relative to its **project or group** (not only group).

5. **NGINX start/stop from UI**  
   Start/stop (and reload) work for the server detail page for the given node (via gRPC to agent).

---

## 2. Clarifying Questions

### 2.1 Agent ID and URL format

- **Q1:** Today, server URL is `/servers/zabbix1+10.0.2.15`. Is `agent_id` **always** `hostname+ip` (e.g. from agent config or `.agent_id`), or can it be just hostname? If it can be both, we need a single canonical id (e.g. always use `agent_id` from ListAgents) for logs, exec, and config.
- **Q2:** When multiple nodes share the same hostname (e.g. in different networks), do you want to keep `hostname+ip` as the canonical `agent_id`, or is there another scheme (e.g. env var `AGENT_ID` per node)?

### 2.2 Correct interface for gateway → agent

- **Q3:** For “figure out the correct interface on the nodes”: should the **agent** report the **address:port** the gateway must use to reach it (e.g. from config or from the interface that has the default route / a specific label), and the gateway **always** use that for dialing? Or should the gateway try multiple strategies (e.g. connection peer IP, then agent-reported mgmt address)?
- **Q4:** Is the failure for `zabbix1+10.0.2.15` that (a) the gateway cannot reach 10.0.2.15 (e.g. different VLAN), or (b) the agent is listening on another interface (e.g. eth1), or (c) something else (e.g. agent_id mismatch)?

### 2.3 SSH vs gRPC-only

- **Q5:** Confirm: we should **remove SSH** for exec and use **only gRPC** (gateway → agent Execute stream). Any case where SSH must remain (e.g. air-gapped nodes that cannot open a gRPC port)?

### 2.4 Environments source of truth

- **Q6:** Should the **only** source of environments for a project be (1) agents reporting `environment` label (auto-create on first connect), (2) or also allow **manually created** environments in Settings → Projects (current behavior)? Plan assumes both: list = DB rows for that project (manual + auto-created from agent labels).

### 2.5 Drift “from project or groups”

- **Q7:** For “drift for the node from its project or groups”: do you want (a) one drift result per **group** the agent belongs to (current `GET /api/servers/:id/drift`), plus (b) an optional **project-level** drift (e.g. compare to a project “golden” or to all agents in project), or (c) only group-level drift but ensure it’s clearly visible from the server detail page?

### 2.6 Radar reference

- **Q8:** Radar is K8s-native (no agent; talks to K8s API for logs/exec). For Avika we keep gateway → agent (gRPC). Should we only reuse **UI/UX patterns** (e.g. log stream UX, terminal UX) and keep our gRPC backend, or do you want a deeper alignment (e.g. SSE shape, terminal protocol)?

---

## 3. Current Behavior (Summary)

| Area | Current behavior |
|------|------------------|
| **Environments** | New projects get three default environments (Production, Staging, Development). `GET /api/projects/:id/environments` returns DB list. Agent with unknown env slug is not assigned (no auto-create). |
| **Agent config** | `GET/PATCH /api/agents/:id/config` proxy to agent’s AgentConfigService. Frontend: `agents/[id]/config` and `api/servers/[id]/config`. No prominent “Edit agent config” from server detail. |
| **Logs** | Frontend: EventSource to `GET /api/servers/:id/logs` → Next.js route → gRPC GetLogs with `instance_id: id`. Gateway: GetLogs looks up session by `req.InstanceId` and forwards LogRequest on the agent’s stream; agent tails file and sends entries. **Issue:** If `id` ≠ session key (e.g. URL uses hostname+ip but session key is hostname only), or agent not in sessions, logs fail. For pods, gateway dials agent by `podIP:mgmt_port` for other RPCs but logs go over the **stream**; if stream is dead, logs fail. |
| **Exec / Terminal** | WebSocket to gateway `/terminal?agent_id=...`. Gateway: `getAgentClient(agentID)` → dial `session.ip` or `session.podIP:mgmt_port`, then Execute stream. **Issue:** If gateway cannot reach that IP (wrong interface/NAT), or agent_id mismatch, exec fails. No SSH in current flow; label “SSH” in UI is misleading. |
| **NGINX start/stop** | Server detail POST to `/api/servers/:id` with action reload/restart/stop; frontend proxies to gateway; gateway uses gRPC (ReloadNginx, etc.) via `getAgentClient(id)`. Same reachability/agent_id issues as exec. |
| **Drift** | `GET /api/servers/:agentId/drift` returns drift for that agent **per group** (groups the agent is in). No project-level drift on server detail. |

---

## 4. Proposed Behavior

### 4.1 Dynamic environments (align with existing plan)

- **New projects:** Do **not** create default environments.  
- **Agent connects** with labels `project=<slug>`, `environment=<slug>`: if project exists and environment with that slug does **not**, **create** environment (e.g. `EnsureEnvironment(projectID, slug, name)`), then assign.  
- **List environments:** `GET /api/projects/:id/environments` returns all environments for that project (manual + auto-created).  
- **UI:** After project select, show that list. Empty state: “No environments yet. Connect agents with AVIKA_LABEL_PROJECT and AVIKA_LABEL_ENVIRONMENT set, or add in Settings → Projects.”

### 4.2 Agent config from UI and persistence

- **Single source of truth:** Agent’s on-disk config (e.g. avika-agent.conf).  
- **Flow:** UI (server detail or inventory) → “Edit agent config” → `agents/[id]/config` → GET/PATCH `api/agents/:id/config` (gateway) → gateway calls agent’s GetAgentConfig / UpdateAgentConfig with **persist=true** so agent writes to file.  
- **Entry points:** Add “Edit agent config” (or “Config”) on server detail and in inventory row actions, linking to `/agents/{agent_id}/config`.  
- **Validation:** Agent validates and optionally hot-reloads; UI shows success/error from PATCH response.

### 4.3 Agent-reported management address (correct interface)

- **Agent:** Report a **management address** the gateway should use to dial back (e.g. `mgmt_address: "10.0.2.15:5025"` or from config). Logic options: (1) from config (e.g. `MANAGEMENT_BIND` or new `AVIKA_MGMT_ADVERTISE`), (2) or auto-detect (e.g. default route interface, or first non-loopback), and send in heartbeat or AgentInfo.  
- **Gateway:** When opening a **new** gRPC connection to an agent (for GetLogs proxy, Execute, ReloadNginx, config, etc.), use **agent-reported mgmt address** if present; otherwise fall back to current behavior (connection peer IP for VMs, podIP for pods).  
- **Result:** Same path for VMs and pods; no SSH; correct interface for dial-back.

### 4.4 Log streaming for all nodes/pods

- **Canonical id:** All server-detail and log/exec/config routes use the **same** identifier: `agent_id` from ListAgents (session key). Frontend must use that exact value in URLs (e.g. `/servers/{agent_id}`, `/api/servers/{agent_id}/logs`).  
- **Next.js logs route:** Keep streaming via gRPC GetLogs; ensure `id` is decoded and passed as `instance_id`; no extra mapping.  
- **Gateway GetLogs:** Already uses stream when agent is connected. If agent is connected, logs flow. Fix: ensure (1) agent_id in URL matches session key, and (2) for “follow” mode, agent actually streams new lines (current agent sends tail then stops; we may need to add follow/streaming on agent side).  
- **Reference (Radar):** Use similar **log stream UX** (e.g. live tail, clear errors, reconnect) while keeping our gRPC backend.

### 4.5 Exec (terminal) — gRPC only, no SSH

- **Remove:** Any SSH path or UI wording that implies SSH.  
- **Keep:** WebSocket → gateway → gRPC Execute to agent.  
- **Reachability:** Use agent-reported mgmt address for dial (see 4.3).  
- **Reference (Radar):** Reuse **terminal UX** (e.g. copy/paste, clear errors) and ensure we handle reconnects and “agent offline” cleanly.

### 4.6 NGINX start/stop/reload

- **Same path as exec:** Use `getAgentClient(agentID)` with agent-reported mgmt address.  
- **Server detail:** POST to `/api/servers/:id` with action reload/restart/stop; backend uses ReloadNginx / RestartNginx / StopNginx via gRPC. No SSH.

### 4.7 Drift for node from project and groups

- **Existing:** `GET /api/servers/:agentId/drift` returns drift **per group** for that agent.  
- **Add (optional):** Project-level drift for this agent (e.g. “vs. project baseline” or “vs. other agents in project”) if a project-level baseline or comparison is defined.  
- **UI:** Server detail drift tab shows group drift items; if project-level drift is implemented, show a section for project-level drift as well.

---

## 5. Implementation Plan (Phases)

### Phase 1: Dynamic environments (backend + frontend)

| Step | Task | Details |
|------|------|--------|
| 1.1 | Stop default environments on project create | In `handleCreateProject`, remove call to `CreateDefaultEnvironments(project.ID)` (or make it configurable and default off). |
| 1.2 | Auto-create environment on first agent slug | In `autoAssignAgentToEnvironment`, if `GetEnvironmentBySlug(projectID, envSlug)` returns nil, call `EnsureEnvironment(projectID, envSlug, humanize(slug))`, then assign. |
| 1.3 | DB helper | Add `EnsureEnvironment(projectID, slug, name string) (*Environment, error)` in rbac.go (get-or-create by (project_id, slug)). |
| 1.4 | Frontend empty state | When project selected and `environments.length === 0`, show message and link to Settings (no fixed sit/dev/prod). |

**Backward compatibility:** Existing projects keep their current environments. Only **new** projects start with zero environments unless an admin adds them or agents report labels.

---

### Phase 2: Agent config UI and persistence

| Step | Task | Details |
|------|------|--------|
| 2.1 | Persist on update | Ensure gateway PATCH `/api/agents/:id/config` sends `persist: true` (and hot_reload if supported) so agent writes to avika-agent.conf. |
| 2.2 | Entry point from server detail | On server detail page, add “Edit agent config” button → `/agents/{id}/config`. Use same `id` as in URL (agent_id). |
| 2.3 | Entry point from inventory | In agent-fleet-table (or inventory), add “Config” / “Edit config” per row → `/agents/{agent_id}/config`. |
| 2.4 | Verify agents API | Ensure GET/PATCH `api/agents/:id/config` and agents/[id]/config page work with the same id used in server list and detail. |

---

### Phase 3: Agent-reported management address and gateway dial

| Step | Task | Details |
|------|------|--------|
| 3.1 | Proto (optional) | If not already present, add field to heartbeat or AgentInfo for “advertised mgmt address” (e.g. `mgmt_address: "host:port"`). |
| 3.2 | Agent: set advertised address | Agent sets mgmt address from config (e.g. `AVIKA_MGMT_ADVERTISE`) or auto-detect (e.g. bind address of mgmt listener, or default-route interface IP + mgmt port). Send in heartbeat. |
| 3.3 | Gateway: use advertised address | In `getAgentClient(agentID)`, if session has advertised mgmt address, use it for dial; else keep current logic (podIP for pods, connection peer IP for VMs). |
| 3.4 | Session store | Store `mgmt_address` (or equivalent) on AgentSession when processing heartbeat. |

This fixes “correct interface” so exec, logs (if we ever proxy via new connection), reload, and config work from gateway to node/pod.

---

### Phase 4: Log streaming (reliability and UX)

| Step | Task | Details |
|------|------|--------|
| 4.1 | Canonical agent_id | Ensure inventory and server detail use **same** id: `agent_id` from ListAgents. Links: `/servers/${instance.agent_id}` (and encode if needed for `+`). |
| 4.2 | Next.js logs route | Decode `id` and pass to gateway GetLogs; handle reconnect/errors (SSE error events). |
| 4.3 | Agent follow mode | If GetLogs is used with follow=true, agent should stream new log lines (e.g. tail + fsnotify or polling) and send entries; today it may only send tail. Implement or confirm follow behavior on agent. |
| 4.4 | UX (Radar-inspired) | Clear “Connected” / “Disconnected” / “Error”; reconnect button; optional log type toggle (access/error). |

---

### Phase 5: Exec (terminal) and NGINX actions — gRPC only

| Step | Task | Details |
|------|------|--------|
| 5.1 | Remove SSH references | Remove any SSH code or UI text (“SSH”, “kubectl exec” copy-paste if not needed). Terminal is “Web Terminal” via gRPC only. |
| 5.2 | Terminal URL | Ensure server detail passes `agentId={id}` (same as URL id) to TerminalOverlay; WebSocket uses `agent_id=` that matches session. |
| 5.3 | Reachability | Rely on Phase 3 (agent-reported mgmt address) so gateway can dial agent for Execute. |
| 5.4 | NGINX reload/restart/stop | Same getAgentClient + agent-reported address. Verify POST /api/servers/:id with action reaches gateway and gateway calls ReloadNginx/RestartNginx/StopNginx. |

---

### Phase 6: Drift for node from project and groups

| Step | Task | Details |
|------|------|--------|
| 6.1 | Keep group drift | `GET /api/servers/:agentId/drift` continues to return drift per group (current behavior). |
| 6.2 | Project-level drift (optional) | If desired: add project-level baseline or “compare to all in project” and include in response (e.g. `project_drift` in JSON). |
| 6.3 | UI | Server detail drift tab shows group (and optional project) drift; clear labels. |

---

### Phase 7: Radar-inspired polish (reference only)

| Step | Task | Details |
|------|------|--------|
| 7.1 | Log stream | Adopt UX patterns (live tail, status, errors) without changing gRPC contract. |
| 7.2 | Terminal | Adopt terminal UX patterns (reconnect, copy, clear) with our WebSocket→gRPC bridge. |

---

## 6. Out of scope (this plan)

- Changing how agents send labels (already supported).
- Removing or renaming existing environment slugs for existing projects.
- Full Radar-style K8s API–based logs/exec (we keep gateway→agent gRPC).
- Bulk agent config or config templates (future work).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Agent not reporting mgmt address | Fallback to current behavior (peer IP / podIP). |
| Existing projects expect default envs | Only new projects get no defaults; existing keep Production/Staging/Development. |
| agent_id format (hostname vs hostname+ip) | Standardize on one: use whatever the agent sends and use that everywhere in URLs and APIs. |
| Log “follow” not implemented on agent | Phase 4.3: implement tail+stream on agent or document as “tail only” for now. |

---

## 8. Acceptance criteria

- [ ] Selecting a project shows only that project’s environments (from DB; may include auto-created from agent labels). New projects have no environments until added or reported by agents.
- [ ] User can open “Edit agent config” from server detail and inventory; changes persist to agent’s config file.
- [ ] Log stream works from server detail for every agent (VM and pod) when agent is connected; agent_id in URL matches session.
- [ ] Terminal (exec) works from server detail without SSH; gateway uses agent-reported mgmt address when available.
- [ ] NGINX reload/restart/stop work from server detail via gRPC.
- [ ] Drift tab for a server shows drift for that node from its group(s) (and optionally project).
- [ ] No dependency on SSH for exec or NGINX control.

---

## 9. Review checklist

- [ ] Confirm dynamic environments: no default envs for new projects; auto-create from agent labels.
- [ ] Confirm agent config: persist to file; entry points from server detail and inventory.
- [ ] Confirm gRPC-only exec and NGINX actions; no SSH.
- [ ] Confirm agent-reported mgmt address for “correct interface” and fallback behavior.
- [ ] Confirm drift: group-level (and optional project-level) for server detail.
- [ ] Confirm agent_id is single canonical id for logs, exec, config, and URLs.
- [ ] Answer Q1–Q8 where product decisions are needed.

---

*Once reviewed and questions answered, implementation will be done on a separate feature branch.*
