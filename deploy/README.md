# Avika Agent Deployment Guide

## Quick Start

### 1. Deploy a New Agent

On the target host, run:

```bash
curl -fsSL http://<MANAGER_IP>:8090/deploy-agent.sh | \
  GATEWAY_SERVER=<MANAGER_IP>:50051 \
  UPDATE_SERVER=http://<MANAGER_IP>:8090 \
  sudo -E bash
```

**Example:**
```bash
curl -fsSL http://192.168.1.10:8090/deploy-agent.sh | \
  GATEWAY_SERVER=192.168.1.10:50051 \
  UPDATE_SERVER=http://192.168.1.10:8090 \
  sudo -E bash
```

### 2. Update Existing Agent Configuration

If you already have an agent installed and need to update its configuration:

```bash
# Edit the configuration file
sudo nano /etc/avika-agent/agent.conf

# Update GATEWAY_SERVER and UPDATE_SERVER values
# Then restart the service
sudo systemctl restart avika-agent
```

### 3. Upgrade Agent to Latest Version

Agents automatically check for updates every 168 hours (7 days). To trigger an immediate update:

**Option A: Via UI**
- Navigate to the Inventory page
- Click the amber update badge next to the agent

**Option B: Via API**
```bash
curl -X POST http://<MANAGER_IP>:3000/api/servers/<AGENT_ID>/update
```

**Option C: Manual**
```bash
# On the agent host
sudo systemctl restart avika-agent
# The agent will check for updates on startup
```

## Configuration

### Environment Variables (Deployment Time)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_SERVER` | Yes | `localhost:50051` | Gateway server address |
| `UPDATE_SERVER` | Yes | _(none)_ | Update server URL for self-updates |
| `AGENT_USER` | No | `root` | User to run the agent as |

### Configuration File (`/etc/avika-agent/agent.conf`)

After deployment, customize the agent by editing `/etc/avika-agent/agent.conf`:

```bash
# Gateway Server (required)
GATEWAY_SERVER="192.168.1.10:50051"

# Agent Identity (optional, auto-detected if empty)
AGENT_ID=""

# Health Check Port
HEALTH_PORT=8080

# Self-Update Configuration
UPDATE_SERVER="http://192.168.1.10:8090"
UPDATE_INTERVAL="168h"

# NGINX Configuration
NGINX_STATUS_URL="http://127.0.0.1/nginx_status"
ACCESS_LOG_PATH="/var/log/nginx/access.log"
ERROR_LOG_PATH="/var/log/nginx/error.log"
LOG_FORMAT="combined"

# Directories
BUFFER_DIR="/var/lib/avika-agent/"
BACKUP_DIR="/var/lib/nginx-manager/backups"

# Logging
LOG_LEVEL="info"
```

After editing, restart the agent:
```bash
sudo systemctl restart avika-agent
```

## Resource Limits

The agent service is configured with the following resource limits:

- **CPU**: 50% of one core (CPUQuota=50%)
- **Memory**: 512MB hard limit, 256MB soft limit
- **File Descriptors**: 8,192 max open files
- **Processes**: 512 max processes/threads
- **Tasks**: 256 max tasks (fork bomb protection)

To adjust these limits, edit `/etc/systemd/system/avika-agent.service` and run:
```bash
sudo systemctl daemon-reload
sudo systemctl restart avika-agent
```

## Troubleshooting

### Check Agent Status
```bash
sudo systemctl status avika-agent
```

### View Agent Logs
```bash
# Real-time logs
sudo journalctl -u avika-agent -f

# Last 50 lines
sudo journalctl -u avika-agent -n 50

# Logs since boot
sudo journalctl -u avika-agent -b
```

### Check Agent Version
```bash
/usr/local/bin/avika-agent --version
```

### Test Connectivity to Gateway
```bash
# Check if gateway is reachable
nc -zv <GATEWAY_IP> 50051

# Check if update server is reachable
curl -I http://<UPDATE_SERVER_IP>:8090/version.json
```

### Agent Won't Update

If the agent shows an update available but won't update:

1. **Check service runs as root:**
   ```bash
   sudo systemctl show avika-agent | grep User
   # Should show: User=root
   ```

2. **Check update server is reachable:**
   ```bash
   curl http://<UPDATE_SERVER>/version.json
   ```

3. **Check agent logs for errors:**
   ```bash
   sudo journalctl -u avika-agent -n 100 | grep -i update
   ```

4. **Manually trigger update:**
   ```bash
   sudo systemctl restart avika-agent
   ```

## Uninstallation

To completely remove the agent:

```bash
# Stop and disable service
sudo systemctl stop avika-agent
sudo systemctl disable avika-agent

# Remove files
sudo rm -f /usr/local/bin/avika-agent
sudo rm -f /etc/systemd/system/avika-agent.service
sudo rm -rf /etc/avika-agent
sudo rm -rf /var/lib/avika-agent
sudo rm -rf /var/lib/nginx-manager

# Reload systemd
sudo systemctl daemon-reload
```

## Security Notes

- The agent runs as **root** by default to manage NGINX and perform self-updates
- For production, consider using capabilities instead of full root access
- The agent needs write access to `/usr/local/bin/` for self-updates
- Network traffic between agent and gateway is unencrypted (use VPN/firewall in production)
