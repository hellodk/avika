# Implementation Plan: Agent Config, Drift, Logs, SSH, NGINX Control

## Requirements Summary

- **Agent config (avika-agent.conf)**: Persist to file per agent; all keys editable; apply at group level; backup mandatory (keep last 5), restore.
- **Drift for node**: Show on server detail (Drift tab) and inventory (per-row status); drift vs every group the node belongs to.
- **Log streaming**: Live logs + filters (time range, HTTP status, IP/subnet/CIDR, header).
- **SSH/terminal**: VM with multiple interfaces — use correct IP for SSH; in-browser terminal option; fix agent_id encoding (e.g. `zabbix1+10.0.2.15`).
- **NGINX start/stop**: Validate config (`nginx -t`) before restart; only restart if valid; wire UI to gateway RestartNginx/StopNginx.

---

## Phase 1: NGINX restart/stop (DONE)

- [x] Agent: run `nginx -t` before restart in `config/manager.go` (TestConfig + Restart).
- [x] Frontend API route: call gateway `RestartNginx` and `StopNginx` for actions `restart` and `stop`.
- [x] Server detail page: show toast with success/error (e.g. config test failed).

---

## Phase 2: Log streaming SSE + filters

- [ ] **Gateway**: Add HTTP SSE endpoint `GET /api/servers/{id}/logs?follow=1&log_type=access|error&tail=100` that proxies to gRPC GetLogs and streams as SSE (or keep gRPC-only and add Next.js route).
- [ ] **Next.js** (if gateway stays gRPC-only): Add `GET /api/servers/[id]/logs/route.ts` that calls gateway gRPC GetLogs and streams response as SSE.
- [ ] **Filters**: Extend LogRequest (or query params) with: time_range, status_codes (e.g. 404,5xx), client_ip/cidr, header filters. Agent/gateway filter logs before streaming.
- [ ] **Frontend**: Use EventSource with encoded agent id; add filter UI (time range, status, IP/CIDR, header).

---

## Phase 3: Agent config persist to file, backup, restore, group apply

- [ ] **Agent**: Add RPC (or extend config service) to read/write `/etc/avika/avika-agent.conf` (key=value). Support “persist and optionally restart agent.”
- [ ] **Agent**: Backup on write (keep last 5); list backups; restore from backup by name/index.
- [ ] **Gateway**: HTTP API to get/set agent file config; backup list; restore backup; “apply to group” (read config from one agent, write to all in group with backup).
- [ ] **Frontend**: Agent Settings tab — all avika-agent.conf keys; “Save to file” + “Restore from backup” (dropdown last 5); “Apply to group” (select group, confirm).

---

## Phase 4: Drift for node

- [ ] **Gateway**: `GET /api/servers/{agentId}/drift` — resolve agent to all assigned groups; for each group run drift (or reuse last report); return list of { group_id, group_name, status, baseline_agent_id, diff_summary, report_id }.
- [ ] **Frontend**: Server detail — “Drift” tab showing per-group drift status and link to full report/diff. Inventory table — column “Drift” with badge (in sync / drifted / error) per row.

---

## Phase 5: SSH and multi-interface VM

- [ ] **Agent/Gateway**: Report “preferred SSH address” (e.g. from config or heuristic: first non-loopback, or interface matching gateway subnet).
- [ ] **Frontend**: Use that address for `ssh://` link. Option: “Open in-browser terminal” for VMs (same WebSocket terminal as pods).
- [ ] **Encoding**: Ensure agent_id with `+` is encoded in all links (e.g. `encodeURIComponent(id)` for terminal and API calls); gateway decodes once.

---

## Backup retention (Phase 3)

- Keep last **5** backups of avika-agent.conf (and optionally nginx config backups from existing logic).
- Naming: e.g. `avika-agent.conf.20260121-143022.bak`.
- Restore: user picks backup → agent overwrites current file and optionally restarts.
