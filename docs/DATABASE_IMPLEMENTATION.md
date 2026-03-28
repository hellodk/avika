# Database Implementation Documentation

Avika NGINX Manager uses a dual-database architecture to balance relational integrity with high-performance analytics.

## Architecture Overview

The system architecture distinguishes between relational state and high-volume observability data:

1.  **PostgreSQL**: Handles relational data, configuration, and state management where ACID compliance is critical.
2.  **ClickHouse**: Handles high-volume time-series data, analytics, metrics, and distributed tracing where write-throughput and query performance are paramount.

---

## PostgreSQL (Relational Database)

PostgreSQL is the primary store for configuration, identity, and system state.

### Core Tables

#### `agents`
Stores information about registered and connected NGINX agents.
- `agent_id` (TEXT, PK): Unique identifier for the agent.
- `hostname` (TEXT): Hostname of the system where the agent is running.
- `version` (TEXT): NGINX version reported by the agent.
- `instances_count` (INT): Number of NGINX instances managed by the agent.
- `uptime` (TEXT): Human-readable uptime string.
- `ip` (TEXT): IP address used for communication.
- `status` (TEXT): Current state (`online`, `offline`, `unknown`).
- `last_seen` (BIGINT): Unix timestamp of the last heartbeat.
- `is_pod` (BOOLEAN): Whether the agent is running in a Kubernetes Pod.
- `pod_ip` (TEXT): Internal IP of the Pod if applicable.
- `agent_version` (TEXT): Version of the agent binary.
- `psk_authenticated` (BOOLEAN): Whether the agent authenticated via Pre-Shared Key.

#### `users`
Management of user accounts and roles for the web interface.
- `username` (TEXT, PK): Unique login name.
- `password_hash` (TEXT): Securely hashed password.
- `role` (TEXT): User level (`admin`, `viewer`, etc.).
- `email` (TEXT): Optional contact email.
- `is_active` (BOOLEAN): Activation status.
- `last_login` (TIMESTAMP): Last successful authentication.

#### `alert_rules`
Configuration for the alert engine.
- `id` (UUID, PK): Unique identifier for the rule.
- `name` (TEXT): Descriptive name of the alert.
- `metric_type` (TEXT): Metric source (e.g., `cpu`, `memory`, `http_errors`).
- `threshold` (FLOAT): Trigger point for the alert.
- `comparison` (TEXT): Operator (e.g., `>`, `<`).
- `window_sec` (INT): Evaluation window in seconds.
- `enabled` (BOOLEAN): Active status of the rule.
- `recipients` (TEXT): Notification targets (e.g., email, OpsGenie).

#### `settings`
Global application configuration.
- `key` (TEXT, PK): Configuration key.
- `value` (TEXT): Configuration value.
- `description` (TEXT): Context for the setting.

#### `staged_configs`
Pending configuration changes awaiting approval or application.
- `target_id` (TEXT): ID of the agent or environment.
- `config_path` (TEXT): Path to the configuration file (e.g., `nginx.conf`).
- `content` (TEXT): The new configuration content.
- `created_by` (TEXT): Author of the change.
- `description` (TEXT): Reason for the change.

---

## ClickHouse (Analytics Database)

ClickHouse is used for storing and querying large-scale telemetry data.

### Analytics Tables

All tables are located in the `nginx_analytics` database and use the `MergeTree` engine for high performance.

#### `access_logs`
Raw HTTP request logs from NGINX instances, enriched with GeoIP data.
- `timestamp` (DateTime64): Time of the request.
- `instance_id` (String): The agent that reported the log.
- `remote_addr` (String): Client IP.
- `request_method` (String): GET, POST, etc.
- `request_uri` (String): Requested path.
- `status` (UInt16): HTTP status code.
- `body_bytes_sent` (UInt64): Response size.
- `request_time` (Float32): Duration of the request.
- `country`, `city`, `latitude`, `longitude`: GeoIP enrichment.

#### `nginx_metrics`
NGINX-specific performance counters.
- `active_connections` (UInt32): Current open connections.
- `total_requests` (UInt64): Lifetime request count.
- `requests_per_second` (Float64): CALCULATED traffic rate.
- `status_2xx`, `status_3xx`, `status_4xx`, `status_5xx`: Response code distribution.

#### `system_metrics`
Host-level resource utilization from agents.
- `cpu_usage` (Float32): Percentage of CPU used.
- `memory_usage` (Float32): Percentage of Memory used.
- `network_rx_bytes`, `network_tx_bytes`: Cumulative network traffic.

#### `spans`
Distributed tracing data for request flow analysis.
- `trace_id` (String): Global ID for the request trace.
- `span_id` (String): ID for a specific operation.
- `parent_span_id` (String): ID of the parent operation.
- `attributes` (Map(String, String)): Key-value pairs for span context.

### Data Retention (TTL)
To manage disk space, ClickHouse tables implement automatic Time-To-Live (TTL) policies:
- **`access_logs`**: 7 Days
- **`spans`**: 7 Days
- **`system_metrics`**: 30 Days
- **`nginx_metrics`**: 30 Days
- **`gateway_metrics`**: 30 Days

---

## Migration & Management

- **PostgreSQL**: Managed via embedded SQL scripts in `cmd/gateway/migrations/`. These run automatically when the gateway starts.
- **ClickHouse**: Managed via a `migrate()` function in `cmd/gateway/clickhouse.go`, ensuring the `nginx_analytics` database and tables exist with correct schemas.
