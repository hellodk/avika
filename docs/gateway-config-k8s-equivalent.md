# Gateway config: K8s cluster equivalent

Same structure as your local `gateway.yaml`, but with values used when the gateway runs in the cluster (Helm release `avika`, namespace `avika`). Replace `avika` with your release/namespace if different.

---

```yaml
# -----------------------------------------------------------------------------
# Server (from values.yaml components.gateway.env + ports)
# -----------------------------------------------------------------------------
server:
  grpc_port: 5020
  http_port: 5021
  metrics_port: 5022

# -----------------------------------------------------------------------------
# Database (from deployment env: DB_DSN + secret)
# Password comes from Secret: <release>-db-secrets, key: postgres-password
# Get it: kubectl -n avika get secret avika-db-secrets -o jsonpath='{.data.postgres-password}' | base64 -d
# -----------------------------------------------------------------------------
database:
  dsn: "postgres://admin:<POSTGRES_PASSWORD>@avika-postgresql.avika.svc.cluster.local:5432/avika?sslmode=disable"
  max_open_conns: 25

# -----------------------------------------------------------------------------
# ClickHouse (from deployment env: CLICKHOUSE_ADDR, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD)
# Password: same Secret, key: clickhouse-password
# Database name not set in chart → gateway default "nginx_analytics"
# -----------------------------------------------------------------------------
clickhouse:
  address: "avika-clickhouse-0.avika-clickhouse.avika.svc.cluster.local:9000"
  database: "nginx_analytics"

# -----------------------------------------------------------------------------
# Kafka (only when components.redpanda.enabled = true; default in values is false)
# When redpanda is disabled, KAFKA_BROKERS is not set in the deployment;
# the gateway then uses its default (e.g. localhost:9092) or env from elsewhere.
# -----------------------------------------------------------------------------
kafka:
  brokers: "avika-redpanda.avika.svc.cluster.local:9092"   # only if redpanda enabled

# -----------------------------------------------------------------------------
# LLM (from values.yaml llm.*; default: enabled: false)
# When enabled, baseUrl can be set (e.g. for Ollama in cluster).
# -----------------------------------------------------------------------------
llm:
  enabled: false
  provider: "openai"
  model: "gpt-4-turbo"
  base_url: ""
  # Example for Ollama in cluster:
  # enabled: true
  # provider: "ollama"
  # model: "llama2"
  # base_url: "http://avika-ollama.avika.svc.cluster.local:11434"
```

---

## Quick reference: where each value comes from

| Section       | Source |
|--------------|--------|
| **server**   | `deploy/helm/avika/values.yaml` → `components.gateway.ports` and `components.gateway.env` (GATEWAY_GRPC_PORT, GATEWAY_HTTP_PORT, GATEWAY_METRICS_PORT) |
| **database** | Deployment env `DB_DSN` (template uses `$(POSTGRES_PASSWORD)` from Secret `avika-db-secrets`); DB name `avika` from Postgres component |
| **clickhouse** | Deployment env `CLICKHOUSE_ADDR` (StatefulSet pod DNS); password from `avika-db-secrets`; database `nginx_analytics` is gateway default (chart doesn’t set CLICKHOUSE_DATABASE) |
| **kafka**    | Set only when `components.redpanda.enabled: true` → `avika-redpanda:9092` |
| **llm**      | `values.yaml` → `llm.*`; override with `--set llm.enabled=true`, `llm.provider=ollama`, `llm.baseUrl=http://...` |

## Get secrets from the cluster

```bash
# PostgreSQL password
kubectl -n avika get secret avika-db-secrets -o jsonpath='{.data.postgres-password}' | base64 -d && echo

# ClickHouse password
kubectl -n avika get secret avika-db-secrets -o jsonpath='{.data.clickhouse-password}' | base64 -d && echo
```

Replace `avika` with your Helm release name if different.
