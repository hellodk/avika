# NGINX Manager & AI Analytics

A production-grade NGINX Management & Monitoring Application enhanced with AI-driven intelligence for anomaly detection and root cause analysis.

## Architecture

The system consists of four primary components:

1.  **Agent (Go)**: Deployed alongside NGINX instances. It collects metrics, tails logs, and manages NGINX configuration/certificates.
2.  **Gateway (Go)**: Central command and control server. It manages agent sessions, streams logs to the UI, and provides a gRPC API for the frontend.
3.  **AI Engine (Python/Bytewax)**: Consumes telemetry from Kafka. It uses machine learning to detect anomalies and correlates logs for Root Cause Analysis (RCA).
4.  **Frontend (Next.js)**: A modern web interface for managing the NGINX fleet, viewing real-time logs, and analyzing performance via AI-driven dashboards.

## Key Features

-   **Fleet Management**: Manage multiple NGINX instances from a single dashboard.
-   **Real-time Observability**: Live tailing of access and error logs via gRPC/SSE.
-   **AI Diagnostics**: Automatic anomaly detection with associated Root Cause Analysis (RCA).
-   **Full-Stack OTel**: Integrated OpenTelemetry pipeline for metrics and logs.

## Getting Started

To run the complete infrastructure and background services:

```bash
cd deploy/docker
docker-compose up -d
```

For detailed instructions on configuration, ports, and external components, see [deploy/docker/README.md](./deploy/docker/README.md).

## Development

-   **API Definitions**: Located in `api/proto/agent.proto`.
-   **Frontend**: Run `npm run dev` in the `frontend` directory.
-   **Agent**: Run `go build -o agent ./cmd/agent`.
