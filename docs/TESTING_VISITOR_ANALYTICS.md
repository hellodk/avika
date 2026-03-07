# How to Test Visitor Analytics (GoAccess-style)

## 1. Run the stack

### Option A: Full stack (Docker + gateway + agent + frontend)

```bash
# From repo root: start Postgres + ClickHouse, then gateway, agent, frontend
./scripts/start.sh
```

- **Frontend:** http://localhost:3000  
- **Gateway HTTP (API):** http://localhost:5021  
- **ClickHouse:** localhost:8123 (used by gateway)

The frontend proxies `/api/visitor-analytics` to the gateway (via `GATEWAY_HTTP_URL` / `GATEWAY_URL`, default `http://localhost:5021`).

### Option B: Docker Compose only (infra), then run gateway + frontend locally

```bash
cd deploy/docker
docker-compose up -d
# Wait for Postgres (5432) and ClickHouse (8123), then:

# Terminal 1 – Gateway (needs DB_DSN and ClickHouse)
export DB_DSN="postgres://admin:yourpassword@localhost:5432/avika?sslmode=disable"
export CLICKHOUSE_DSN="http://localhost:8123/default"
# If your gateway binary expects a config file, use it
./gateway

# Terminal 2 – Frontend
cd frontend && npm run dev
```

### Option C: Kubernetes

Use your existing Avika Helm deploy. Port-forward if needed:

```bash
kubectl port-forward -n avika svc/avika-gateway 5021:5021
kubectl port-forward -n avika svc/avika-frontend 3000:3000
# Open http://localhost:3000
```

---

## 2. Log in

1. Open http://localhost:3000 (or your frontend URL).
2. Log in with **admin / admin** (default from DB migration `002_seed_users.sql`). If you changed the admin password, use that instead.
3. Go to **Analytics → Visitor Analytics** (or **/analytics/visitors**).

---

## 3. Get data into ClickHouse

Visitor analytics reads from **ClickHouse `nginx_analytics.access_logs`**. Rows get there when:

- **Agents** send access log lines to the gateway over gRPC; the gateway calls `InsertAccessLog` and writes to ClickHouse.

So you need at least one **running agent** that is tailing an NGINX (or mock) access log and streaming to the gateway. With no agents or no traffic, the UI will show zeros and empty tables.

**Ways to get data:**

1. **Real agent + NGINX**  
   Run an Avika agent that tails a real NGINX `access_log`. Generate traffic (e.g. `curl` in a loop, or browse to the site). Data will appear after the next batch insert.

2. **K8s mock stack**  
   If you use the deploy that runs NGINX + agent in-cluster, hit the NGINX service a few times; the agent will send logs to the gateway.

3. **Manual insert into ClickHouse (for UI testing only)**  
   Connect to ClickHouse and insert rows into `nginx_analytics.access_logs` (columns: `timestamp`, `instance_id`, `remote_addr`, `request_method`, `request_uri`, `status`, `body_bytes_sent`, `user_agent`, `referer`, etc.). Then open Visitor Analytics and pick a time window that includes those timestamps.

---

## 4. What to check in the UI

- **Summary:** Unique visitors, total hits, total bandwidth, bot vs human hits.
- **Overview:** Hourly distribution, device types, human vs bot pie, top browsers.
- **Tabs:** Browsers, Operating Systems, Referrers, 404 Errors, Static Files, **Requested URLs**, **Status Codes**.
- **Time window:** Use the dropdown (e.g. 24h, 7d); data should change accordingly.
- **Optional:** If you have multiple agents, use `agent_id` (when the UI supports it) to filter.

---

## 5. API check (no browser)

With a valid session cookie (e.g. after logging in in the browser):

```bash
# Replace with your cookie if testing from another host
curl -s -b "avika_session=YOUR_SESSION_COOKIE" \
  "http://localhost:5021/api/visitor-analytics?timeWindow=24h" | jq .
```

Or via the frontend (same cookie):

```bash
curl -s -b "avika_session=YOUR_SESSION_COOKIE" \
  "http://localhost:3000/api/visitor-analytics?timeWindow=24h" | jq .
```

You should see `summary`, `browsers`, `operating_systems`, `referrers`, `not_found`, `hourly`, `devices`, `static_files`, `requested_urls`, `status_codes`.

---

## 6. E2E (Playwright)

The settings page E2E only checks that the settings page loads. There is no dedicated E2E for visitor analytics yet. To run all E2E tests (frontend must be up):

```bash
cd frontend && npm run test:e2e
```

To run only the settings test:

```bash
cd frontend && npm run test:e2e -- tests/e2e/settings.spec.ts
```

---

## Troubleshooting

| Symptom | Check |
|--------|--------|
| All zeros / empty tables | No data in `access_logs`. Ensure ClickHouse is up, gateway has correct `CLICKHOUSE_DSN`, and an agent is sending access logs. |
| 401 on `/api/visitor-analytics` | Not logged in or session expired. Log in again. |
| 500 from gateway | Check gateway logs; often DB or ClickHouse connection. |
| Frontend shows “Failed to fetch” | Frontend cannot reach gateway. Ensure `GATEWAY_HTTP_URL` (or `GATEWAY_URL`) points to the gateway HTTP URL (e.g. `http://localhost:5021` when running locally). |
