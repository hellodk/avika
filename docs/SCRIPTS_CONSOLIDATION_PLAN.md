# Scripts Folder Analysis and Consolidation Plan

This document analyses `scripts/` for redundancy and proposes a plan to reduce the number of scripts while keeping behaviour clear and maintainable.

---

## Current Inventory (24 items)

| Script / File | Purpose | Category |
|---------------|---------|----------|
| `agent-quickref.sh` | Prints deploy one-liner and service commands (reference card) | Doc / reference |
| `build-agent.sh` | Build agent Go binaries (amd64/arm64) + Docker image; optional K8s deploy | Build |
| `build-stack.sh` | Full stack: version bump, build-agent, gateway/frontend Docker, optional K8s | Build |
| `build_images.sh` | Build gateway, frontend, ai-engine, log-aggregator, agent (legacy paths) | Build (legacy) |
| `build.conf` | Shared build config (DOCKER_REPO, K8s, etc.) | Config |
| `deploy-agent.sh` | One-liner installer (served by gateway at /updates/deploy-agent.sh) | Deploy (product) |
| `deploy-gateway-log.sh` | Push gateway:log image and update K8s deployment | Deploy (ops) |
| `deploy-pr-tag.sh` | Deploy frontend/gateway by PR image tag (e.g. pr-58) | Deploy (ops) |
| `docker-build.sh` | Build single agent Docker image (cmd/agent/Dockerfile); prompts for push | Build (legacy) |
| `release-local.sh` | Agent “local release”: version bump, build agent binaries, dist/, version.json | Build / release |
| `start.sh` | Start gateway, agent, frontend (and optional infra) locally | Service |
| `stop.sh` | Stop gateway, agent, frontend | Service |
| ~~`db_check.go`~~ | **Moved** to `cmd/db-check` (see Phase 3) | Utility |
| `extract_all_agent_instructions.py` | Extract user instructions from Cursor agent transcripts | Dev tool |
| `generate_test_report.py` | Generate HTML/PDF test reports from test results | Test |
| `get-clickhouse-credentials.sh` | Get ClickHouse creds from K8s secret for local gateway | Ops utility |
| `grafana-setup.sh` | Create Avika folder in Grafana, organize dashboards | Ops utility |
| `install-git-hooks.sh` | Install post-commit / pre-push hooks (optional build-stack on commit) | Dev |
| `load_test_50k.sh` | Simple: run simulator 50k RPS, 500 agents, 2m | Load test |
| `load_test_50k_100agents.sh` | Full harness: 50k RPS, 100 agents, results dir, warmup/cooldown | Load test |
| `onboard-issues-to-project.sh` | Create GitHub issues from plan and add to project (gh CLI) | Dev / project |
| `profile_agent.sh` | Agent resource profiling (memory, goroutines, pprof) | Dev / perf |
| `regression_tests.sh` | Regression test suite (version, log flow, etc.; optional K8s) | Test |
| `run_all_tests.sh` | Run Go, frontend, integration, e2e; generate reports | Test |
| `safe-push.sh` | Git push with uncommitted-check and secret scan | Dev / git |
| `README.md` | Documents start/stop/restart/status (restart/status are missing) | Doc |

---

## Redundancies and Overlaps

### 1. Build / Docker (high overlap)

| Script | What it does | Redundancy |
|--------|----------------|------------|
| **build-agent.sh** | Canonical agent build: Go binaries (bin/), Docker image (nginx-agent/Dockerfile), optional K8s. Used by CI and build-stack. | **Keep** (single source of truth for agent). |
| **build-stack.sh** | Calls build-agent.sh; builds gateway + frontend Docker; optional K8s. Uses build.conf. | **Keep** (single source for full stack). |
| **release-local.sh** | Version bump; builds agent binaries (duplicates build-agent’s Go build); creates dist/, version.json, copies deploy-agent.sh; no Docker. | **Overlap**: Same Go build as build-agent. Option: have release-local call `BUMP=none ./scripts/build-agent.sh` (or a shared “build agent binaries only” target) and only add dist/ packaging. |
| **docker-build.sh** | Builds agent image from `cmd/agent/Dockerfile` (different from nginx-agent/Dockerfile); old image name pattern (yourusername/nginx-manager-agent); interactive push. | **Redundant** with build-agent.sh. build-agent uses nginx-agent/Dockerfile and hellodk/avika-agent. Recommend **deprecate/remove** and point docs to build-agent.sh. |
| **build_images.sh** | Builds gateway, frontend, ai-engine, log-aggregator, agent (deploy/docker/Dockerfile.agent). Different Dockerfiles and image names (e.g. gateway vs avika-gateway). | **Overlaps** with build-stack.sh. References ai-engine, log-aggregator, deploy/docker/Dockerfile.agent. If these are legacy, **deprecate** and use build-stack.sh; if still needed, align with build-stack (same Dockerfiles and image names). |

### 2. Load tests (same tool, two scripts)

| Script | What it does |
|--------|----------------|
| **load_test_50k.sh** | Runs simulator: 50k RPS, 500 agents, 2m. |
| **load_test_50k_100agents.sh** | Runs simulator: 50k RPS, 100 agents; full harness (results dir, warmup, cooldown, report). |

**Recommendation:** Merge into one script (e.g. `load_test.sh`) with env vars or args: `AGENTS=500 DURATION=2m ./scripts/load_test.sh` vs `AGENTS=100 DURATION=5m ./scripts/load_test.sh`, and optional “full harness” (results dir, warmup/cooldown) when requested.

### 3. Missing scripts (docs vs reality)

- **restart.sh** and **status.sh** are referenced in `scripts/README.md` and in `start.sh` output but **do not exist**.
- **Recommendation:** Either add minimal `restart.sh` (stop + start) and `status.sh` (list PIDs/ports for gateway, agent, frontend), or remove references from README and start.sh.

### 4. Other (no redundancy)

- **deploy-agent.sh** – Product script served by gateway; keep.
- **deploy-gateway-log.sh**, **deploy-pr-tag.sh** – Niche deploy helpers; keep.
- **get-clickhouse-credentials.sh**, **grafana-setup.sh** – Ops utilities; keep.
- **run_all_tests.sh**, **regression_tests.sh**, **generate_test_report.py** – Used by Makefile; keep.
- **start.sh**, **stop.sh** – Service management; keep.
- **safe-push.sh**, **install-git-hooks.sh** – Dev helpers; keep.
- **agent-quickref.sh** – Reference only; keep or fold into docs (e.g. docs/AGENT_DEPLOYMENT.md).
- **profile_agent.sh** – Profiling; keep.
- **onboard-issues-to-project.sh** – Project onboarding; keep.
- **extract_all_agent_instructions.py** – Dev tool; keep (or move under `scripts/dev/` if you add a subfolder).
- **db_check.go** – Doesn’t belong in scripts by type; consider moving to `cmd/db-check` or `internal/` and building via `go run` or a small Make target.

---

## Consolidation Plan (prioritised)

### Phase 1: Low-risk cleanup

1. **Fix missing scripts**
   - Add `restart.sh` (call stop.sh then start.sh) and `status.sh` (show running gateway/agent/frontend PIDs and ports), **or**
   - Remove all references to restart.sh/status.sh from README and start.sh.

2. **Deprecate docker-build.sh**
   - Add a one-line deprecation message at the top pointing to `build-agent.sh`.
   - Update docs (VERSIONING_GUIDE.md, AGENT_VERSION_TRACKING.md, SERVICE_MANAGEMENT.txt) to use build-agent.sh.
   - In a later release, remove docker-build.sh.

3. **Clarify build_images.sh**
   - If ai-engine / log-aggregator / deploy/docker/Dockerfile.agent are obsolete: add deprecation and point to build-stack.sh; then remove or move to `scripts/legacy/`.
   - If still in use: document when to use build_images.sh vs build-stack.sh and align image names/Dockerfiles with the rest of the repo.

### Phase 2: Reduce duplication

4. **Merge load test scripts**
   - Single script `load_test.sh` (or keep name `load_test_50k_100agents.sh` as the main one and make it parameterised).
   - Env vars: `AGENTS`, `DURATION`, `RPS`, optional `HARNESS=1` for results dir + warmup/cooldown.
   - Remove or replace the simple `load_test_50k.sh` with a call to the unified script (e.g. `AGENTS=500 DURATION=2m ./scripts/load_test.sh`).

5. **release-local.sh vs build-agent.sh**
   - Option A: Have release-local.sh call `BUMP=none ./scripts/build-agent.sh` (or a shared function/target that only builds agent binaries), then do dist/ and version.json and deploy-agent copy. Removes duplicated Go build logic.
   - Option B: Extract “build agent binaries only” into a small shared snippet or Make target; both build-agent.sh and release-local.sh use it. Then build-agent.sh adds Docker; release-local.sh adds dist/.

### Phase 3: Optional structure (if you want fewer files in root of scripts/)

6. **Subfolders (optional)**
   - `scripts/build/` – build-agent.sh, build-stack.sh, release-local.sh, build.conf.
   - `scripts/deploy/` – deploy-agent.sh (copy/symlink for gateway serving?), deploy-gateway-log.sh, deploy-pr-tag.sh.
   - `scripts/test/` – run_all_tests.sh, regression_tests.sh, load_test.sh, generate_test_report.py.
   - `scripts/dev/` – safe-push.sh, install-git-hooks.sh, profile_agent.sh, extract_all_agent_instructions.py, onboard-issues-to-project.sh.
   - `scripts/ops/` – get-clickhouse-credentials.sh, grafana-setup.sh.
   - Keep start.sh, stop.sh (and restart.sh, status.sh if added) in `scripts/` root for visibility.

   If you introduce subfolders, update Makefile and any CI that invokes these scripts.

7. **db_check.go** ✅ **Done**
   - Moved to `cmd/db-check`. Build/run: `go build ./cmd/db-check` or `go run ./cmd/db-check` (requires `DB_DSN`).

---

## Summary Table

| Action | Script(s) | Effect |
|--------|-----------|--------|
| **Keep as-is** | build-agent.sh, build-stack.sh, deploy-agent.sh, start.sh, stop.sh, run_all_tests.sh, regression_tests.sh, generate_test_report.py, safe-push.sh, install-git-hooks.sh, get-clickhouse-credentials.sh, grafana-setup.sh, deploy-gateway-log.sh, deploy-pr-tag.sh, profile_agent.sh, onboard-issues-to-project.sh, extract_all_agent_instructions.py, agent-quickref.sh | No change. |
| **Add or fix references** | restart.sh, status.sh | Add scripts or remove from README/start.sh. |
| **Deprecate then remove** | docker-build.sh | Point docs to build-agent.sh; remove when safe. |
| **Deprecate or align** | build_images.sh | Deprecate if legacy; else align with build-stack. |
| **Merge** | load_test_50k.sh, load_test_50k_100agents.sh | One parameterised load_test.sh. |
| **Refactor** | release-local.sh | Call build-agent (or shared binary build) + dist/ packaging only. |
| **Relocate** | db_check.go | Move to cmd/ or internal/. |

---

## Estimated Reduction

- **Before:** 24 files in scripts/ (including README, build.conf, db_check.go).
- **After Phase 1+2:** Remove or merge 3–4 scripts (docker-build.sh deprecated/removed; build_images.sh deprecated or aligned; load tests merged; release-local refactor avoids duplicate logic). Add 0–2 (restart.sh, status.sh) if you create them.
- **Net:** Fewer redundant scripts, one clear agent build path (build-agent.sh), one full-stack build path (build-stack.sh), one load-test entrypoint, and consistent docs.

**Implementation status (done):**
- Phase 1: Added `restart.sh` and `status.sh`; deprecated `docker-build.sh` and `build_images.sh` (warning + doc updates).
- Phase 2 (load test): Unified into `load_test.sh` (env: `SIMPLE`, `RPS`, `AGENTS`, `DURATION`); `load_test_50k.sh` and `load_test_50k_100agents.sh` are thin wrappers.
- Phase 2 (release-local): `release-local.sh` now calls `build-agent.sh` with `SKIP_DOCKER=1` and `BUMP=${BUMP:-none}` for binaries, then assembles `dist/` (version.json, service file, deploy script). `build-agent.sh` writes `.sha256` and supports `SKIP_DOCKER=1`.
- Phase 3: `db_check.go` moved to `cmd/db-check`; run with `go run ./cmd/db-check` (set `DB_DSN`).
- Script usage is documented in `scripts/README.md` (how to use each script).
