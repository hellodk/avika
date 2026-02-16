# Agent Configuration Guide

This document describes how to configure the NGINX Manager Agent, including multi-gateway support, UI-based configuration, and advanced settings.

## Table of Contents

- [Multi-Gateway Support](#multi-gateway-support)
- [Configuration Methods](#configuration-methods)
- [UI-Based Configuration](#ui-based-configuration)
- [Configuration File Reference](#configuration-file-reference)
- [Command Line Arguments](#command-line-arguments)
- [Auto-Apply Configuration](#auto-apply-configuration)

---

## Multi-Gateway Support

The agent supports sending telemetry data to multiple gateways simultaneously for redundancy and high availability.

### How It Works

When multi-gateway mode is enabled:

1. The agent establishes connections to **all** configured gateways
2. Heartbeats, metrics, and logs are sent to **every** gateway in parallel
3. Each gateway maintains its own connection and receives identical data
4. If one gateway fails, the agent continues sending to others

### Configuration

#### Via Command Line

```bash
# Single gateway (default)
./nginx-agent -server gateway1.example.com:5020

# Multiple gateways
./nginx-agent -servers "gateway1.example.com:5020,gateway2.example.com:5020,gateway3.example.com:5020"
```

#### Via Configuration File

Edit `/etc/avika/avika-agent.conf`:

```ini
# Single gateway
GATEWAY_SERVER=gateway1.example.com:5020

# Multiple gateways (comma-separated)
GATEWAY_SERVERS=gateway1.example.com:5020,gateway2.example.com:5020
```

#### Via Environment Variables

```bash
export GATEWAY_SERVERS="gateway1.example.com:5020,gateway2.example.com:5020"
./nginx-agent
```

### Priority Order

Configuration is resolved in this order (first match wins):

1. `-servers` command line flag
2. `GATEWAY_SERVERS` config file setting
3. `-server` command line flag
4. `GATEWAY_SERVER` config file setting
5. Default: `localhost:5020`

### Architecture Diagram

```
                    ┌─────────────────┐
                    │   NGINX Agent   │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  Gateway 1  │   │  Gateway 2  │   │  Gateway 3  │
    │ (Primary)   │   │ (Secondary) │   │ (Tertiary)  │
    └─────────────┘   └─────────────┘   └─────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────▼────────┐
                    │   ClickHouse    │
                    │   (Shared DB)   │
                    └─────────────────┘
```

---

## Configuration Methods

The agent supports three configuration methods:

### 1. Command Line Arguments

Best for: Docker containers, testing, one-off deployments

```bash
./nginx-agent \
  -server gateway.example.com:5020 \
  -nginx-status-url http://127.0.0.1/nginx_status \
  -access-log-path /var/log/nginx/access.log \
  -log-level info
```

### 2. Configuration File

Best for: Persistent installations, systemd services

Create `/etc/avika/avika-agent.conf`:

```ini
# Gateway Configuration
GATEWAY_SERVER=gateway.example.com:5020
GATEWAY_SERVERS=gateway1.example.com:5020,gateway2.example.com:5020

# Agent Identity
AGENT_ID=my-nginx-server-01

# NGINX Paths
NGINX_STATUS_URL=http://127.0.0.1/nginx_status
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf
ACCESS_LOG_PATH=/var/log/nginx/access.log
ERROR_LOG_PATH=/var/log/nginx/error.log
LOG_FORMAT=combined

# Agent Settings
HEALTH_PORT=5026
LOG_LEVEL=info
BUFFER_DIR=/var/lib/avika/

# Update Configuration
UPDATE_SERVER=http://updates.example.com:8090
UPDATE_INTERVAL=168h
```

### 3. UI-Based Configuration

Best for: Runtime adjustments, managed environments

See [UI-Based Configuration](#ui-based-configuration) section below.

---

## UI-Based Configuration

The web UI provides a comprehensive interface for configuring agents in real-time.

### Accessing Agent Settings

1. Navigate to **Inventory** in the sidebar
2. Click on an agent's hostname
3. Select the **Agent Settings** tab

### Available Settings

#### Gateway Configuration

| Setting | Description |
|---------|-------------|
| Gateway Addresses | List of gateway endpoints (host:port) |
| Multi-Gateway Mode | Enable/disable sending to multiple gateways |

#### NGINX Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Status URL | NGINX stub_status or VTS endpoint | `http://127.0.0.1/nginx_status` |
| Config Path | Path to nginx.conf | `/etc/nginx/nginx.conf` |
| Access Log Path | Path to access log file | `/var/log/nginx/access.log` |
| Error Log Path | Path to error log file | `/var/log/nginx/error.log` |
| Log Format | Log format type | `combined` |

#### Telemetry Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Metrics Interval | How often to collect metrics (seconds) | `1` |
| Heartbeat Interval | How often to send heartbeats (seconds) | `1` |
| Update Server | URL for self-update server | (empty) |
| Log Level | Logging verbosity | `info` |

#### Feature Flags

| Flag | Description | Default |
|------|-------------|---------|
| VTS Metrics | Enable nginx-module-vts metrics | `true` |
| Log Streaming | Enable real-time log forwarding | `true` |
| Auto-Apply Config | Automatically apply config changes | `true` |

### Configuration Delivery

When you save configuration via the UI:

1. Configuration is sent to the gateway
2. Gateway queues the config update for the agent
3. Agent receives config on next heartbeat (within 1-5 seconds)
4. Agent applies changes and optionally restarts if required

### Settings That Require Restart

The following settings require an agent restart to take effect:

- Gateway addresses (when changing primary gateway)
- Multi-gateway mode (enabling/disabling)
- Health port
- Management port
- Buffer directory

---

## Configuration File Reference

### Complete Configuration File Example

```ini
# /etc/avika/avika-agent.conf
# Complete configuration reference for NGINX Manager Agent

# ============================================================
# GATEWAY CONFIGURATION
# ============================================================

# Primary gateway address (host:port)
GATEWAY_SERVER=gateway.example.com:5020

# Multiple gateways for redundancy (comma-separated)
# When set, overrides GATEWAY_SERVER
GATEWAY_SERVERS=gateway1.example.com:5020,gateway2.example.com:5020

# ============================================================
# AGENT IDENTITY
# ============================================================

# Unique agent identifier (auto-generated if empty)
# Format: hostname+ip or custom string
AGENT_ID=

# ============================================================
# NGINX CONFIGURATION
# ============================================================

# URL to NGINX stub_status module
# Supports both stub_status and nginx-module-vts
NGINX_STATUS_URL=http://127.0.0.1/nginx_status

# Path to main NGINX configuration file
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf

# Path to NGINX access log
ACCESS_LOG_PATH=/var/log/nginx/access.log

# Path to NGINX error log
ERROR_LOG_PATH=/var/log/nginx/error.log

# Log format: "combined" (Apache/NGINX standard) or "json"
LOG_FORMAT=combined

# ============================================================
# AGENT SETTINGS
# ============================================================

# Port for health check endpoints (/health, /ready)
HEALTH_PORT=5026

# Port for management gRPC server
MGMT_PORT=5025

# Directory for persistent buffer (WAL)
BUFFER_DIR=/var/lib/avika/

# Logging level: debug, info, warn, error
LOG_LEVEL=info

# Path to log file (empty = stdout)
LOG_FILE=

# ============================================================
# SELF-UPDATE CONFIGURATION
# ============================================================

# URL of update server (empty = disabled)
UPDATE_SERVER=http://updates.example.com:8090

# Check interval (Go duration: 1h, 24h, 168h)
UPDATE_INTERVAL=168h
```

---

## Command Line Arguments

### Full Argument Reference

```
Usage: nginx-agent [OPTIONS]

Gateway Options:
  -server string
        Primary gateway address (default "localhost:5020")
  -servers string
        Comma-separated gateway addresses for multi-gateway mode

Identity Options:
  -id string
        Agent ID (default: hostname+ip)

NGINX Options:
  -nginx-status-url string
        URL for NGINX stub_status (default "http://127.0.0.1/nginx_status")
  -nginx-config-path string
        Path to nginx.conf (default "/etc/nginx/nginx.conf")
  -access-log-path string
        Path to access log (default "/var/log/nginx/access.log")
  -error-log-path string
        Path to error log (default "/var/log/nginx/error.log")
  -log-format string
        Log format: combined or json (default "combined")

Agent Options:
  -health-port int
        Health check port (default 5026)
  -mgmt-port int
        Management gRPC port (default 5025)
  -buffer-dir string
        Buffer directory (default "./")
  -log-level string
        Log level: debug, info, warn, error (default "info")
  -log-file string
        Log file path (empty = stdout)

Update Options:
  -update-server string
        Update server URL (empty = disabled)
  -update-interval duration
        Update check interval (default 168h)

Other:
  -config string
        Path to config file (default "/etc/avika/avika-agent.conf")
  -version
        Print version and exit
```

---

## Auto-Apply Configuration

When `auto_apply_config` is enabled, the agent automatically applies configuration changes received from the gateway.

### How It Works

1. Gateway sends `ConfigPush` command via gRPC stream
2. Agent validates the new configuration
3. Agent creates a backup of current config
4. Agent applies the new configuration
5. Agent triggers NGINX reload
6. If reload fails, agent rolls back to backup

### Rollback Behavior

```
ConfigPush Received
       │
       ▼
┌──────────────┐
│   Validate   │──────No────► Reject & Log Error
│   Config     │
└──────┬───────┘
       │ Yes
       ▼
┌──────────────┐
│ Create Backup │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Apply Config │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Reload NGINX │──────Fail───► Rollback to Backup
└──────┬───────┘
       │ Success
       ▼
   Complete
```

### Manual Override

To disable auto-apply for a specific agent:

1. Go to agent's **Settings** tab
2. Disable **Auto-Apply Config** toggle
3. Click **Save Configuration**

With auto-apply disabled, configuration changes will be queued but not applied automatically. You can manually apply them from the UI.

---

## Best Practices

### Production Deployments

1. **Use multi-gateway mode** for high availability
2. **Set appropriate health check ports** to avoid conflicts
3. **Enable log streaming** for real-time observability
4. **Configure update server** for automated agent updates

### Security Considerations

1. Use **TLS between agent and gateway** (configure via reverse proxy)
2. **Restrict management port** access via firewall rules
3. **Rotate agent IDs** when redeploying sensitive instances

### Monitoring

1. Monitor agent health via `/health` endpoint
2. Check readiness via `/ready` endpoint
3. Review gateway connection status in UI

---

## Troubleshooting

### Agent Not Connecting

1. Verify gateway address is reachable: `nc -zv gateway.example.com 5020`
2. Check agent logs: `journalctl -u nginx-agent -f`
3. Verify firewall rules allow outbound connections

### Multi-Gateway Not Working

1. Ensure all gateway addresses are valid
2. Check each gateway is running and healthy
3. Review agent logs for connection errors per gateway

### Configuration Not Applying

1. Verify `auto_apply_config` is enabled
2. Check agent has write permissions to NGINX config
3. Validate NGINX config syntax: `nginx -t`
4. Review agent logs for rollback messages
