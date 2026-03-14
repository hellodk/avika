# Agent Deploy Issues – Analysis and Plan

This document analyses the four issues reported after running the deploy one-liner and proposes a concrete plan for review.

---

## 1. Version shows `0.1.0-dev` instead of `1.106.2`

**Why it happens**

- The agent’s version is set at **build time** via `-ldflags -X main.Version=...`.
- The binary served by the gateway at `192.168.1.10:5021` was built with the **old** gateway image (before the Dockerfile fix that reads the repo `VERSION` file). So the binary was built with `VERSION=dev` or default → it reports `0.1.0-dev`.
- “Latest version: 1.106.2” comes from **version.json** on the server; “Installed version” comes from **the binary’s embedded version**. Those can differ until the gateway image is rebuilt.

**Plan**

| Item | Action |
|------|--------|
| 1.1 | **Already done:** Gateway Dockerfile was updated to use repo `VERSION` when building the agent and when generating `version.json`. |
| 1.2 | Rebuild and redeploy the **gateway** image from a tree that has the desired `VERSION` (e.g. 1.106.4). Then re-run the deploy script (or use self-update) so the new binary has the correct embedded version. |
| 1.3 | Optional: In the deploy script, after install, **warn** when `Installed version` ≠ `Latest version` (e.g. “You may be running an older gateway; rebuild/redeploy gateway to serve binaries with the correct version.”). |

---

## 2. Agent ID uses `+` and `.`; agreed to use `-` only

**Current behaviour**

- In `cmd/agent/main.go`, `getOrGenerateAgentID()` builds the ID as:
  - `hostname + "+" + chosenIP` (e.g. `zabbix2+10.0.2.15`).
- So we use **`+`** as delimiter and **`.`** in the IP. This can be problematic in IDs (e.g. URLs, log indexing, UI).

**Agreed direction**

- Use **`-`** instead of `+` for the delimiter.
- Avoid **`.`** in the agent name (e.g. replace dots in the IP with `-`: `10-0-2-15` → ID like `zabbix2-10-0-2-15`).

**Plan**

| Item | Action |
|------|--------|
| 2.1 | In `getOrGenerateAgentID()`: build ID as `hostname + "-" + sanitizedIP` where `sanitizedIP = strings.ReplaceAll(chosenIP, ".", "-")` (e.g. `zabbix2-10-0-2-15`). |
| 2.2 | Add a small helper, e.g. `sanitizeAgentIDSuffix(ip string) string`, so the rule is in one place. |
| 2.3 | **Existing persisted IDs:** If `agent_id` file already exists, keep returning it (no change in behaviour for existing installs). Only **new** IDs use the new format. Optional: document that renaming (e.g. remove `agent_id` and restart) will switch to the new format. |
| 2.4 | Update `cmd/agent/agent_test.go`: `TestAgentIDGeneration` already expects `hostname + "-" + ip`; align the test with the new format (hostname + "-" + IP with dots replaced by `-`) so the test passes. |
| 2.5 | Update `cmd/agent/README.md` and any docs that say “hostname-ip” to clarify format is `hostname-IP-with-dots-replaced-by-dash` (e.g. `node1-192-168-1-10`). |

---

## 3. Correct IP when the server has multiple network interfaces

**Chosen approach: agent sends all candidate IPs, gateway probes and picks**

- **Agent** sends **all** non-loopback IP addresses (with mgmt port) in the heartbeat as **`mgmt_address_candidates`** (repeated string). No client-side heuristic for “which IP is correct” — works for K8s CNI, Vagrant, multi-NIC, etc.
- **Gateway** receives the list and:
  1. **Port check**: For each candidate `host:port`, the gateway attempts a short TCP dial (e.g. 2s timeout). If it succeeds, the address is reachable.
  2. **Tie-breaking** when multiple are reachable:
     - Prefer the **connection peer** (the IP the agent used to connect to the gateway) if it appears in the candidate list — that path is known to work.
     - Else prefer an address in the **same subnet** as the gateway’s outbound/local IP (if determinable).
     - Else use the **first reachable** candidate.
  3. Store the chosen address as the effective **mgmt_address** for dial-back (and optionally cache with TTL so we don’t probe on every request).
- **Backward compatibility**: Keep existing `mgmt_address` in the heartbeat (agent can set it to the first candidate or leave empty). If the gateway has no candidates, it falls back to current behaviour (single mgmt_address or connection peer).

**Plan**

| Item | Action |
|------|--------|
| 3.1 | **Proto**: Add `repeated string mgmt_address_candidates = 13` to the `Heartbeat` message in `api/proto/agent.proto`. Regenerate `internal/common/proto/agent/agent.pb.go`. |
| 3.2 | **Agent**: Add `getAllCandidateMgmtAddresses()` returning all non-loopback IPv4 (and optionally IPv6) with mgmt port. In heartbeat (and bootstrap heartbeat), set `MgmtAddress` to the first candidate (or leave as current behaviour) and set `MgmtAddressCandidates` to the full list. |
| 3.3 | **Gateway**: In `AgentSession`, store `mgmtAddressCandidates []string`. On heartbeat, update session with candidates. In `getAgentClient()` (and any code that dials the agent): if we have candidates, (1) if connection peer is in candidates, use it; (2) else probe each candidate (TCP dial, short timeout); (3) among reachable, prefer connection peer, then same-subnet as gateway, then first. Cache chosen address per session (refresh on heartbeat). |
| 3.4 | **Document** in `docs/AGENT_CONFIGURATION.md`: agent sends all candidate addresses; gateway performs reachability checks and picks one; optional env vars (e.g. `AVIKA_MGMT_ADVERTISE`) still override when set. |

---

## 4. Agent not using GATEWAY_SERVER and UPDATE_SERVER from the deploy command

**Root cause**

- The deploy script writes the config to **`/etc/avika/avika-agent.conf`** (`CONFIG_DIR="/etc/avika"`).
- The agent’s **default** config path is **`/etc/avika-agent/avika-agent.conf`** (see `cmd/agent/main.go`: `configFile = flag.String("config", "/etc/avika-agent/avika-agent.conf", ...)`).
- The systemd unit runs **`/usr/local/bin/avika-agent`** with **no** `-config` argument, so the agent uses its default path.
- So the agent **never reads** `/etc/avika/avika-agent.conf` and falls back to empty `gatewayAddr` → **`getGatewayAddresses()`** returns the default **`["localhost:5020"]`**. Same for `UPDATE_SERVER` and other keys in that file.

**Evidence**

- Log: “Connecting to 1 gateway(s): [localhost:5020]” → only the default is used.
- Config written by the script: `GATEWAYS="192.168.1.10:5020,10.106.3.57:5020"` and `UPDATE_SERVER="http://192.168.1.10:5021/updates"` in `/etc/avika/avika-agent.conf`.

**Plan**

| Item | Action |
|------|--------|
| 4.1 | **Unify default config path** with the rest of the project: change the agent’s default from `/etc/avika-agent/avika-agent.conf` to **`/etc/avika/avika-agent.conf`** in `cmd/agent/main.go`. Then, when no `-config` is passed (e.g. from systemd), the agent will read the file the deploy script created. |
| 4.2 | **Systemd unit:** In `deploy/systemd/avika-agent.service`, set **`ExecStart=/usr/local/bin/avika-agent -config=/etc/avika/avika-agent.conf`** so that even old binaries (with the wrong default) still load the correct config. Comment in the unit already says “configuration loaded from /etc/avika/avika-agent.conf”. |
| 4.3 | After these changes, the agent will load `GATEWAYS` and `UPDATE_SERVER` (and the rest) from `/etc/avika/avika-agent.conf` and will connect to the gateways and update server provided in the deploy command. |

---

## Implementation order (suggested)

1. **4.1 + 4.2** – Config path and systemd (fixes “not using GATEWAY_SERVER/UPDATE_SERVER” and connection to localhost).
2. **2.1–2.5** – Agent ID format (`-` and no `.`).
3. **3.1–3.2** – Document IP selection and add optional commented NAT CIDR in deploy script.
4. **1.2** – Rebuild/redeploy gateway (operator action).
5. **1.3** – Optional deploy-script version mismatch warning.

---

## Summary table

| # | Issue | Cause | Fix (short) |
|---|--------|--------|-------------|
| 1 | Version 0.1.0-dev | Binary built with old gateway image (no VERSION in ldflags) | Rebuild gateway; optional deploy warning |
| 2 | Agent ID `zabbix2+10.0.2.15` | Code uses `+` and raw IP with `.` | Use `hostname-IP-with-dashes` (e.g. `zabbix2-10-0-2-15`) for new IDs |
| 3 | “Correct IP” with multiple NICs | Logic exists but may need CIDR or docs | Document AVIKA_MGMT_*; optional AVIKA_MGMT_NAT_CIDR in deploy template |
| 4 | Agent uses localhost:5020 | Default config path is `/etc/avika-agent/...`, deploy writes `/etc/avika/...` | Default config `/etc/avika/avika-agent.conf` + systemd `-config=...` |

Once you’re happy with this plan, we can implement the code and config changes in that order.
