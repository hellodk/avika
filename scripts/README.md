# Scripts Reference

This directory contains scripts for local development, builds, deployment, testing, and operations. Below: quick start, then **how to use each script**.

---

## Quick Start (local services)

```bash
./scripts/start.sh      # Start gateway, agent, frontend (and optional infra)
./scripts/status.sh     # Check what's running
./scripts/stop.sh       # Stop all
./scripts/restart.sh    # Stop then start
```

Interactive HTTPS + env snippet (gateway URLs, optional DB/ClickHouse, gRPC TLS/mTLS, cert generation):

```bash
./scripts/dev-https-local.sh
```

Writes `frontend/.env.local.https-snippet` (gitignored via `*.https-snippet`) — merge into `frontend/.env.local`. See [docs/QUICK_REFERENCE.md](../docs/QUICK_REFERENCE.md).

---

## Script Reference (how to use each)

### Local HTTPS / environment snippet

| Script | Purpose | How to use |
|--------|---------|------------|
| **dev-https-local.sh** | Prompts for gateway HTTP/gRPC URLs, optional `NEXT_PUBLIC_BASE_PATH`, gRPC TLS + optional mTLS paths, optional DB/ClickHouse reference lines, and whether to create dev certs under `certs/local/` (mkcert or openssl). Writes **`frontend/.env.local.https-snippet`**. Does not overwrite `.env.local`. | `./scripts/dev-https-local.sh` from repo root (interactive). Merge the snippet, then run Next with `--experimental-https` using the printed key/cert paths. |

### Service management

| Script | Purpose | How to use |
|--------|---------|------------|
| **start.sh** | Start gateway, agent, frontend; optionally start Postgres/ClickHouse via docker-compose. Creates `logs/`. | `./scripts/start.sh` — Prompts if services already run. Use `AGENT_ID=my-id` if needed. |
| **stop.sh** | Stop gateway, agent, frontend, update-server (SIGTERM then SIGKILL after 10s). | `./scripts/stop.sh` |
| **restart.sh** | Stop all, wait 2s, start all. | `./scripts/restart.sh` |
| **status.sh** | Show running/stopped for Gateway, Agent, Frontend, Update Server; show PIDs and ports. | `./scripts/status.sh` |

---

### Build

| Script | Purpose | How to use |
|--------|---------|------------|
| **build-agent.sh** | Build agent Go binaries (linux amd64/arm64) into `bin/` with `.sha256`; optionally build and push multi-arch Docker image `hellodk/avika-agent` and apply K8s manifest. Uses `scripts/build.conf`. | `./scripts/build-agent.sh` — Bumps version (patch). `BUMP=none` — No bump. `SKIP_DOCKER=1` — Binaries only (used by release-local.sh). `SKIP_GIT_CHECK=1` to allow uncommitted changes. |
| **build-stack.sh** | Full stack: version bump, build agent (calls build-agent.sh), build gateway + frontend Docker images, optional K8s deploy. | `./scripts/build-stack.sh` — Config via `build.conf` / `build.conf.local`. `BUMP=minor`, `BUMP=none`, etc. **Quick dev (amd64 only):** `AMD64_ONLY=1 ./scripts/build-stack.sh` or `BUILD_PLATFORMS=linux/amd64 ./scripts/build-stack.sh`. |
| **release-local.sh** | Agent “local release”: builds via **build-agent.sh** (SKIP_DOCKER), then creates `dist/` with version.json, deploy-agent.sh copy, systemd service. For serving updates from gateway. | `SERVER_URL=http://your-gateway:5021/updates ./scripts/release-local.sh` — Requires SERVER_URL. `BUMP=none` (default) or `patch`/`minor`/`major`. |
| **build.conf** | Shared build config: DOCKER_REPO, K8S_NAMESPACE, BUILD_PLATFORMS, etc. | Copy to `build.conf.local` (gitignored) to override. |
| **docker-build.sh** | **(Deprecated)** Legacy agent Docker build (single arch, old image name). | Use **build-agent.sh** instead. |
| **build_images.sh** | **(Deprecated)** Legacy “build all images” (different Dockerfiles). | Use **build-stack.sh** instead. |

---

### Deploy

| Script | Purpose | How to use |
|--------|---------|------------|
| **deploy-agent.sh** | One-liner installer: download agent binary from update server, verify checksum, install to `/usr/local/bin/avika-agent`, write `/etc/avika/avika-agent.conf`, download systemd unit. **Served by gateway** at `/updates/deploy-agent.sh`. | On a host: `curl -fsSL http://GATEWAY:5021/updates/deploy-agent.sh \| sudo UPDATE_SERVER=http://GATEWAY:5021/updates GATEWAY_SERVER=GATEWAY:5020 bash` |
| **deploy-gateway-log.sh** | Push gateway image tagged `log` and update K8s deployment to use it. | `./scripts/deploy-gateway-log.sh` — Set `IMAGE`, `NAMESPACE` if needed. |
| **deploy-pr-tag.sh** | Deploy frontend and gateway using a PR image tag (e.g. pr-58). | `./scripts/deploy-pr-tag.sh pr-58` |

---

### Testing

| Script | Purpose | How to use |
|--------|---------|------------|
| **run_all_tests.sh** | Run Go (gateway, agent, common), frontend unit, integration, e2e; generate HTML/PDF reports. | `./scripts/run_all_tests.sh` — Options: `--skip-integration`, `--skip-e2e`, `--open-report`, `--pdf`. |
| **regression_tests.sh** | Regression suite (version display, agent log flow, etc.; some tests need K8s). | `./scripts/regression_tests.sh` — Invoked by `make test-regression`. |
| **load_test.sh** | Unified load test: run simulator against gateway. **Simple mode** (no harness) or **full harness** (baseline, resource monitor, warmup, cooldown, report). | **Simple:** `SIMPLE=1 RPS=50000 AGENTS=500 DURATION=2m ./scripts/load_test.sh` **Full:** `RPS=50000 AGENTS=100 DURATION=5m ./scripts/load_test.sh` — Env: `GATEWAY_TARGET`, `RPS`, `AGENTS`, `DURATION`. |
| **load_test_50k.sh** | Quick load test: 50k RPS, 500 agents, 2m (wrapper for load_test.sh simple mode). | `./scripts/load_test_50k.sh` |
| **load_test_50k_100agents.sh** | Full harness: 50k RPS, 100 agents, 5m (wrapper for load_test.sh). | `./scripts/load_test_50k_100agents.sh` |
| **generate_test_report.py** | Generate HTML/PDF test report from test results. | `python3 scripts/generate_test_report.py` — Options: `--output-dir`, `--pdf`, `--open`. |

---

### Dev / utilities

| Script | Purpose | How to use |
|--------|---------|------------|
| **safe-push.sh** | Git push with checks: uncommitted changes, secrets in staged files, then show what will be pushed and ask for confirmation. | `./scripts/safe-push.sh` or `./scripts/safe-push.sh "commit message"` |
| **install-git-hooks.sh** | Install post-commit and pre-push hooks (optional auto-build on commit). | `./scripts/install-git-hooks.sh` — Configure via build.conf: `AUTO_BUILD_ON_COMMIT`, `AUTO_BUILD_BUMP_TYPE`. |
| **agent-quickref.sh** | Print one-liner deploy command and service management commands (reference card). | `./scripts/agent-quickref.sh` |
| **profile_agent.sh** | Agent resource profiling: memory, goroutines, pprof under load. | `./scripts/profile_agent.sh` — Options: `--duration`, `--port`, `--output`, `--skip-build`. |
| **extract_all_agent_instructions.py** | Extract user instructions from Cursor agent transcripts under `~/.cursor/projects`. | `python3 scripts/extract_all_agent_instructions.py` — Writes `agent-instructions-extract.txt`. |
| **onboard-issues-to-project.sh** | Create GitHub issues from implementation plan and add to a project (requires `gh`). | `GITHUB_PROJECT_NUMBER=1 ./scripts/onboard-issues-to-project.sh` |
| **db-check** (Go, in `cmd/`) | Query agents table: agent_id, hostname, NGINX/agent version, is_pod, pod_ip. | `DB_DSN=postgres://user:pass@host:5432/avika?sslmode=disable go run ./cmd/db-check` |

---

### Ops

| Script | Purpose | How to use |
|--------|---------|------------|
| **get-clickhouse-credentials.sh** | Get ClickHouse username/password from K8s secret (avika-db-secrets). | `./scripts/get-clickhouse-credentials.sh` — Print vars. `eval $(./scripts/get-clickhouse-credentials.sh -e)` — Export for local gateway. |
| **grafana-setup.sh** | Create Avika folder in Grafana and organize dashboards (kube-prometheus-stack). | `./scripts/grafana-setup.sh` — Uses `GRAFANA_NAMESPACE`, `GRAFANA_SERVICE`, `LOCAL_PORT`. |

---

### Config

| File | Purpose |
|------|---------|
| **build.conf** | Default build settings (DOCKER_REPO, K8S_NAMESPACE, BUILD_PLATFORMS, etc.). Override with `build.conf.local` (gitignored). |

---

## Log management

Logs from `start.sh` are under `logs/`:

- `logs/gateway.log`
- `logs/agent.log`
- `logs/frontend.log`

```bash
tail -f logs/gateway.log
tail -f logs/*.log
```

---

## Environment variables (start.sh)

- **Agent:** `AGENT_ID=my-id` (optional).
- **Gateway:** `DB_DSN`, `CLICKHOUSE_ADDR` (or use defaults from docker-compose).

---

## Troubleshooting

- **Port in use:** `lsof -i :5020` (or 3000, 5021); then `kill <PID>` or run `./scripts/stop.sh`.
- **Services won’t stop:** `./scripts/stop.sh` uses SIGTERM then SIGKILL; as last resort: `pkill -9 -f "./gateway"` (etc.).
- **Build blocked by uncommitted changes:** Use `SKIP_GIT_CHECK=1` only if you know what you’re doing.

---

## Related docs

- `docs/SCRIPTS_CONSOLIDATION_PLAN.md` — Rationale for script merge/deprecations.
- `docs/AGENT_DEPLOYMENT.md` — Agent install and deploy-agent.sh.
- `docs/VERSIONING_GUIDE.md` — Version and CI/CD.
- `Makefile` — `make test`, `make build-gateway`, `make run-gateway`, etc.
