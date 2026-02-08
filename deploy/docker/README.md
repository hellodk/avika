# Infrastructure & Deployment

This directory contains the Docker Compose configuration to start the NGINX Manager background services and infrastructure.

## Services

| Service | Component | Port | Description |
| :--- | :--- | :--- | :--- |
| `gateway` | Gateway | 50051 | gRPC server for Agents and Frontend API |
| `ai-engine` | AI Engine | - | Anomaly detection and RCA (Python) |
| `otel-collector`| OTel | 4317 | Ingests OTLP metrics and logs from Agents |
| `redpanda` | Kafka | 29092 | Message broker for telemetry data |
| `clickhouse` | Stats DB | 8123 | OLAP storage for long-term analytics |
| `postgres` | Metastore | 5432 | Storage for server metadata and config |

## Running the Stack

To start everything in the background:

```bash
docker-compose up -d
```

To view logs for a specific service (e.g., AI Engine):

```bash
docker-compose logs -f ai-engine
```

## Internal Topics

-   `telemetry-metrics`: OTLP metrics from Agents.
-   `telemetry-logs`: OTLP logs from Agents.

## Configuration

-   **OTel Collector**: Configured via `otel-collector-config.yaml`.
-   **Database Schema**: Initialized via `clickhouse-schema.sql`.
