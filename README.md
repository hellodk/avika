# NGINX Manager & AI Analytics

A production-grade NGINX Management & Monitoring Application enhanced with AI-driven intelligence for anomaly detection and root cause analysis.

## Architecture

The system consists of four primary components (see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for a deep dive):

1.  **Agent (Go)**: Deployed alongside NGINX instances. It collects metrics, tails logs, and manages NGINX configuration/certificates. Supports [automated self-updates](./cmd/agent/README.md).
2.  **Gateway (Go)**: Central command and control server. It manages agent sessions, streams logs to the UI, and provides a gRPC API for the frontend.
3.  **AI Engine (Python/Bytewax)**: Consumes telemetry from Kafka. It uses machine learning to detect anomalies and correlates logs for Root Cause Analysis (RCA).
4.  **Frontend (Next.js)**: A modern web interface for managing the NGINX fleet, viewing real-time logs, and analyzing performance via AI-driven dashboards.

## Key Features

-   **Fleet Management**: Manage multiple NGINX instances from a single dashboard.
-   **Real-time Observability**: Live tailing of access and error logs via gRPC/SSE.
-   **AI Diagnostics**: Automatic anomaly detection with associated Root Cause Analysis (RCA).
-   **Full-Stack OTel**: Integrated OpenTelemetry pipeline for metrics and logs.

## Getting Started

### Kubernetes Deployment

Deploy the complete Avika stack using Helm:

```bash
helm upgrade --install avika deploy/helm/avika -n avika --create-namespace
```

### Docker Compose (Development)

To run the complete infrastructure and background services:

```bash
cd deploy/docker
docker-compose up -d
```

For detailed instructions on configuration, ports, and external components, see [deploy/docker/README.md](./deploy/docker/README.md).

## Agent Deployment

### Auto-Install Agent on VMs

The gateway serves agent binaries and deployment scripts. Install the agent on any VM with a single command:

```bash
curl -fsSL http://<GATEWAY_IP>:5021/updates/deploy-agent.sh | \
  sudo UPDATE_SERVER="http://<GATEWAY_IP>:5021/updates" \
  GATEWAY_SERVER="<GATEWAY_IP>:5020" bash
```

**Example** (using Kubernetes ClusterIP):

```bash
curl -fsSL http://10.106.98.165:5021/updates/deploy-agent.sh | \
  sudo UPDATE_SERVER="http://10.106.98.165:5021/updates" \
  GATEWAY_SERVER="10.106.98.165:5020" bash
```

**Alternative** (using environment variables):

```bash
export UPDATE_SERVER="http://<GATEWAY_IP>:5021/updates"
export GATEWAY_SERVER="<GATEWAY_IP>:5020"
curl -fsSL $UPDATE_SERVER/deploy-agent.sh | sudo -E bash
```

### What the Install Script Does

1. Detects system architecture (amd64/arm64)
2. Downloads the agent binary with checksum verification
3. Installs to `/usr/local/bin/avika-agent`
4. Creates configuration at `/etc/avika-agent/agent.conf`
5. Sets up and enables systemd service
6. Starts the agent

### Agent Management

```bash
# View status
sudo systemctl status avika-agent

# View logs
sudo journalctl -u avika-agent -f

# Restart
sudo systemctl restart avika-agent
```

For more details, see [docs/AGENT_DEPLOYMENT.md](./docs/AGENT_DEPLOYMENT.md).

## Development

-   **API Definitions**: Located in `api/proto/agent.proto`.
-   **Frontend**: Run `npm run dev` in the `frontend` directory.
-   **Agent**: Run `go build -o agent ./cmd/agent`.
