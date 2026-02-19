# Avika Agent Deployment

This directory contains the deployment script for the Avika NGINX Manager Agent.

## Quick Start

### Prerequisites

- Root/sudo access on the target machine
- NGINX installed and running
- Network access to the update server and gateway

### Basic Deployment

```bash
# Download and run the deployment script
curl -fsSL http://192.168.1.10:8090/deploy-agent.sh | sudo bash
```

### Custom Deployment

```bash
# Download the script
curl -fsSL http://192.168.1.10:8090/deploy-agent.sh -o deploy-agent.sh
chmod +x deploy-agent.sh

# Deploy with custom gateway server
sudo GATEWAY_SERVER="gateway.example.com:50051" ./deploy-agent.sh

# Deploy with custom update server
sudo UPDATE_SERVER="http://updates.example.com:8090" ./deploy-agent.sh

# Deploy with both custom servers
sudo GATEWAY_SERVER="gateway.example.com:50051" \
     UPDATE_SERVER="http://updates.example.com:8090" \
     ./deploy-agent.sh
```

## What the Script Does

1. **Detects Architecture**: Automatically detects if the system is amd64 or arm64
2. **Downloads Binary**: Fetches the latest agent binary from the update server
3. **Verifies Checksum**: Ensures the downloaded binary hasn't been tampered with
4. **Installs Agent**: Places the binary at `/usr/local/bin/avika-agent`
5. **Creates Configuration**: Generates `/etc/avika/avika-agent.conf`
6. **Sets Up Service**: Creates and enables a systemd service
7. **Starts Agent**: Automatically starts the agent service

## Configuration

After deployment, you can customize the agent configuration:

```bash
sudo nano /etc/avika/avika-agent.conf
```

Key configuration options:

- `GATEWAY_SERVER`: Address of the management gateway
- `UPDATE_SERVER`: URL of the update server for self-updates
- `AGENT_ID`: Custom agent identifier (auto-detected if empty)
- `HEALTH_PORT`: Port for health check endpoints
- `NGINX_STATUS_URL`: URL for NGINX stub_status
- `LOG_LEVEL`: Logging verbosity (debug, info, error)

After editing the configuration, restart the service:

```bash
sudo systemctl restart avika-agent
```

## Service Management

### View Service Status

```bash
sudo systemctl status avika-agent
```

### View Live Logs

```bash
sudo journalctl -u avika-agent -f
```

### Restart Service

```bash
sudo systemctl restart avika-agent
```

### Stop Service

```bash
sudo systemctl stop avika-agent
```

### Disable Service

```bash
sudo systemctl disable avika-agent
```

## File Locations

- **Binary**: `/usr/local/bin/avika-agent`
- **Configuration**: `/etc/avika/avika-agent.conf`
- **Service File**: `/etc/systemd/system/avika-agent.service`
- **Logs**: `/var/log/avika-agent/agent.log`
- **Buffer**: `/var/lib/avika-agent/`
- **Backups**: `/var/lib/nginx-manager/backups/`

## Common Deployment Issues

### Issue 1: `[[: not found` Error

**Symptom:**
```bash
$ sh deploy-agent.sh
deploy-agent.sh: 39: [[: not found
-e [INFO] Starting Avika Agent deployment...
```

**Cause:** The script uses bash-specific syntax but was run with `sh` (POSIX shell).

**Solution:** Use `bash` instead of `sh`:

```bash
# ✅ CORRECT - Use bash explicitly
sudo bash scripts/deploy-agent.sh

# Or make executable and run directly (uses shebang)
chmod +x scripts/deploy-agent.sh
sudo ./scripts/deploy-agent.sh

# Or download from update server
curl -fsSL http://192.168.1.10:8090/deploy-agent.sh | sudo bash
```

**Why this happens:** The script's shebang is `#!/bin/bash`, but when you explicitly call `sh deploy-agent.sh`, it ignores the shebang and uses `/bin/sh` which doesn't support bash-specific syntax like `[[` double brackets.

**What was fixed:** Changed `[[` to `[` for better POSIX compatibility, but using `bash` is still recommended.

---

### Issue 2: 404 Error - Binary Not Found

**Symptom:**
```bash
curl: (22) The requested URL returned error: 404
[ERROR] Failed to download agent binary from http://192.168.1.10:8090/agent-linux-amd64
```

**Cause:** Either the update server isn't running, or the binaries haven't been built yet.

**Solution:**

1. **Build the release:**
   ```bash
   cd /path/to/nginx-manager
   ./scripts/release-local.sh
   ```
   
   You should see:
   ```
   ✅ Local release prepared in ./dist
     - Manifest: ./dist/version.json
     - Binaries: ./dist/bin/
     - Deployment: ./dist/deploy-agent.sh
   ```

2. **Start the update server:**
   ```bash
   go run cmd/update-server/main.go
   ```
   
   You should see:
   ```
   Update server listening on :8090
   Serving files from: ./dist
   ```

3. **Verify server is running:**
   ```bash
   # Check version manifest
   curl http://192.168.1.10:8090/version.json
   
   # Check binary availability
   curl -I http://192.168.1.10:8090/agent-linux-amd64
   
   # Should return: HTTP/1.1 200 OK
   ```

---

### Issue 3: Permission Denied

**Symptom:**
```bash
[ERROR] This script must be run as root (use sudo)
```

**Solution:** Run with `sudo`:
```bash
sudo bash scripts/deploy-agent.sh
```

**Why:** The script needs root privileges to:
- Install binary to `/usr/local/bin/`
- Create systemd service file
- Create directories in `/var/lib/` and `/var/log/`
- Start and enable the systemd service

---

### Issue 4: Update Server Not Accessible

**Symptom:**
```bash
[ERROR] Failed to fetch version manifest from http://192.168.1.10:8090/version.json
Is the update server running?
```

**Solution:**

1. **Check if server is running:**
   ```bash
   curl http://192.168.1.10:8090/version.json
   ```

2. **If not running, start it:**
   ```bash
   cd /path/to/nginx-manager
   go run cmd/update-server/main.go
   ```

3. **Check firewall:**
   ```bash
   # Allow port 8090
   sudo ufw allow 8090/tcp
   ```

4. **Verify network connectivity:**
   ```bash
   ping 192.168.1.10
   telnet 192.168.1.10 8090
   ```

---

## Troubleshooting

### Service Won't Start

Check the logs:
```bash
sudo journalctl -u avika-agent -n 100 --no-pager
```

Common issues:
- **Port 8080 in use**: Change `HEALTH_PORT` in `/etc/avika/avika-agent.conf`
- **Can't connect to gateway**: Verify `GATEWAY_SERVER` address and network connectivity
- **Permission denied**: Ensure the service has access to NGINX logs and config directories

### Manual Version Check

```bash
/usr/local/bin/avika-agent -version
```

### Test Configuration

```bash
# Stop the service
sudo systemctl stop avika-agent

# Run manually to see output
sudo /usr/local/bin/avika-agent -server 192.168.1.10:50051 -id test-agent
```

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop avika-agent
sudo systemctl disable avika-agent

# Remove files
sudo rm /usr/local/bin/avika-agent
sudo rm /etc/systemd/system/avika-agent.service
sudo rm -rf /etc/avika
sudo rm -rf /var/lib/avika-agent
sudo rm -rf /var/log/avika-agent

# Reload systemd
sudo systemctl daemon-reload
```

## Security

The systemd service includes several security hardening features:

- **NoNewPrivileges**: Prevents privilege escalation
- **PrivateTmp**: Isolated /tmp directory
- **ProtectSystem**: Read-only system directories
- **ProtectHome**: Restricted home directory access
- **ReadWritePaths**: Explicit write permissions only for necessary directories

## Updating the Agent

The agent includes self-update functionality:

- **Automatic Updates**: Checks for updates weekly (configurable via `UPDATE_INTERVAL`)
- **Manual Updates**: Trigger immediate updates from the System Health UI by clicking "SYNC NODE"
- **Remote Triggered**: The gateway can push update commands to specific agents
1. Navigate to the System Health page
2. Find the agent in the fleet table
3. Click the "SYNC NODE" button

## Support

For issues or questions:
- Check logs: `sudo journalctl -u avika-agent -f`
- Review configuration: `/etc/avika/avika-agent.conf`
- Verify network connectivity to gateway and update server
