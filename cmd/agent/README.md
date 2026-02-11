# NGINX Manager Agent

The agent is a lightweight Go binary designed to run alongside NGINX instances. It performs real-time telemetry collection, log tailing, and configuration management.

## 🚀 Key Features

- **Telemetry Collection**: High-fidelity collection of system (CPU, Memory, Network) and NGINX metrics (stub_status).
- **Log Tailing**: Real-time streaming of NGINX access and error logs to the Gateway.
- **Config Management**: Support for NGINX configuration synchronization and backups.
- **Self-Update**: Automated polling and atomic binary replacement for seamless fleet updates.
- **Cloud-Native**: Native support for Kubernetes (detection of Pod IP, Node, etc.).

## 🛠️ Self-Update System

The agent includes a built-in self-update mechanism that allows it to synchronize with an update server.

### How it Works
1. **Polling**: Every 5 minutes (default), the agent checks a `version.json` manifest from the configured update server.
2. **Verification**: If a new version is found, it downloads the architecture-specific binary and verifies its SHA256 checksum.
3. **Hot-Swap**: The agent replaces its own binary on disk.
4. **Restart**:
   - **In Containers (K8s)**: The agent exits with code `100`, and Kubernetes restarts the pod with the new binary.
   - **Standalone (Linux)**: The agent triggers `systemctl restart nginx-manager-agent`.

### Configuration Flags
| Flag | Description | Default |
| :--- | :--- | :--- |
| `-update-server` | URL of the update server (e.g., `http://update-server:8090`). Disabled if empty. | `""` |
| `-update-interval` | Interval between update checks (e.g., `10m`, `1h`). | `5m` |

## 📦 Building & Development

### Standard Build
```bash
go build -o agent ./cmd/agent
```

### Local Release (for Self-Update)
To prepare a new version for the self-update system:
1. Update requested version in `VERSION` file.
2. Run the release script:
```bash
./scripts/release-local.sh
```
This builds binaries for `amd64` and `arm64`, calculates checksums, and updates the local manifest in `./dist`.

## ⚙️ Command Line Flags

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-id` | Unique ID for the agent (defaults to hostname-ip). | `""` |
| `-server` | Gateway gRPC address. | `localhost:50051` |
| `-nginx-status-url` | URL for NGINX stub_status. | `http://127.0.0.1/nginx_status` |
| `-access-log-path` | Path to NGINX access log. | `/var/log/nginx/access.log` |
| `-buffer-dir` | Directory for persistent message buffer. | `./` |
| `-version` | Print version information and exit. | `false` |

## 📝 Logs
By default, the agent logs to `stdout`. You can specify a file with `-log-file agent.log`.
