# Avika Agent Update Mechanism

## Overview

The Avika Agent supports both **automatic periodic updates** and **remote-triggered updates** from the management UI.

## Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATE TRIGGER SOURCES                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
         ┌──────▼──────┐           ┌───────▼────────┐
         │  Automatic  │           │  Manual (UI)   │
         │  (Weekly)   │           │  SYNC NODE     │
         └──────┬──────┘           └───────┬────────┘
                │                           │
                │                           │
                │         ┌─────────────────┘
                │         │
                └────┬────┘
                     │
              ┌──────▼──────┐
              │   Updater   │
              │  Component  │
              └──────┬──────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐          ┌──────▼──────┐
    │  Fetch  │          │   Verify    │
    │ Version │          │  Checksum   │
    │ Manifest│          │             │
    └────┬────┘          └──────┬──────┘
         │                      │
         └──────────┬───────────┘
                    │
             ┌──────▼──────┐
             │  Download   │
             │   Binary    │
             └──────┬──────┘
                    │
             ┌──────▼──────┐
             │   Replace   │
             │   Binary    │
             └──────┬──────┘
                    │
             ┌──────▼──────┐
             │   Restart   │
             │   Service   │
             └─────────────┘
```

## Configuration

### Default Settings

```bash
# /etc/avika/avika-agent.conf
UPDATE_SERVER="http://192.168.1.10:8090"
UPDATE_INTERVAL="168h"  # 1 week
```

### Customization

You can adjust the update interval by editing the configuration:

```bash
# Check every 24 hours
UPDATE_INTERVAL="24h"

# Check every 12 hours
UPDATE_INTERVAL="12h"

# Disable automatic updates (manual only)
UPDATE_INTERVAL="8760h"  # 1 year (effectively disabled)
```

After changing the configuration:
```bash
sudo systemctl restart avika-agent
```

## Update Methods

### 1. Automatic Updates (Weekly)

The agent automatically checks for updates every week:

- **Trigger**: Time-based (168 hours by default)
- **Process**: Background goroutine in the agent
- **Action**: Downloads, verifies, and applies updates automatically
- **Restart**: Service restarts after successful update

### 2. Manual UI-Triggered Updates

Trigger updates immediately from the System Health dashboard:

1. Navigate to **System Health** page
2. Locate the agent in the **Agent Fleet** table
3. Click the **"SYNC NODE"** button
4. The gateway sends an `Update` command to the agent
5. Agent immediately checks for updates and applies if available

**Flow:**
```
UI (SYNC NODE) → Gateway API → gRPC UpdateAgent → Agent handleCommand → globalUpdater.CheckAndApply()
```

## Update Server

The update server (`cmd/update-server/main.go`) provides:

- **Version manifest** (`/version.json`)
- **Binary downloads** (`/agent-linux-amd64`, `/agent-linux-arm64`)
- **Checksums** (`/agent-linux-amd64.sha256`, etc.)

### Starting the Update Server

```bash
# Build and release
./scripts/release-local.sh

# Start server
go run cmd/update-server/main.go
```

The server listens on `:8090` and serves files from `./dist/`.

## Security

### Checksum Verification

Every update is verified:

1. Download binary from update server
2. Download corresponding `.sha256` checksum
3. Calculate SHA256 of downloaded binary
4. Compare with expected checksum
5. **Reject update if checksums don't match**

### Binary Replacement

The updater uses atomic operations:

```go
1. Download to temporary file
2. Verify checksum
3. Make executable
4. Replace current binary
5. Trigger service restart
```

## Monitoring Updates

### View Update Logs

```bash
# Real-time logs
sudo journalctl -u avika-agent -f | grep -i update

# Recent update activity
sudo journalctl -u avika-agent -n 100 | grep -i update
```

### Check Current Version

```bash
/usr/local/bin/avika-agent -version
```

### Verify Update Server Connectivity

```bash
# Check version manifest
curl http://192.168.1.10:8090/version.json

# Check binary availability
curl -I http://192.168.1.10:8090/agent-linux-amd64
```

## Troubleshooting

### Update Not Triggering

**Check if updater is enabled:**
```bash
# View service configuration
systemctl cat avika-agent | grep update-server

# Should show:
# -update-server "http://192.168.1.10:8090"
```

**Check agent logs:**
```bash
sudo journalctl -u avika-agent -n 50 | grep -i "updater\|update"
```

### Update Fails

**Common issues:**

1. **Update server unreachable**
   ```bash
   # Test connectivity
   curl http://192.168.1.10:8090/version.json
   ```

2. **Checksum mismatch**
   - Indicates corrupted download or tampered binary
   - Agent will reject the update
   - Check update server logs

3. **Permission denied**
   - Agent needs write access to `/usr/local/bin/`
   - Service should run as root

### Manual Update

If automatic updates fail, you can manually update:

```bash
# Stop service
sudo systemctl stop avika-agent

# Download new binary
curl -fsSL http://192.168.1.10:8090/agent-linux-amd64 -o /tmp/agent-new

# Verify checksum
curl -fsSL http://192.168.1.10:8090/agent-linux-amd64.sha256
sha256sum /tmp/agent-new

# Replace binary
sudo mv /tmp/agent-new /usr/local/bin/avika-agent
sudo chmod +x /usr/local/bin/avika-agent

# Start service
sudo systemctl start avika-agent
```

## Best Practices

1. **Test updates in staging** before deploying to production
2. **Monitor update logs** after triggering updates
3. **Keep update server highly available** for critical environments
4. **Use weekly automatic updates** for non-critical environments
5. **Trigger manual updates** for urgent security patches
6. **Verify checksums** are always enabled (default behavior)

## Architecture Notes

### Updater Component

Located at `cmd/agent/updater/updater.go`:

- **Periodic checker**: Runs in background goroutine
- **Remote trigger**: Responds to gRPC Update commands
- **Atomic updates**: Safe binary replacement
- **Automatic restart**: Triggers systemd restart after update

### Gateway Integration

The gateway (`cmd/gateway/main.go`) provides the `/api/servers/:id` endpoint:

```bash
# Trigger update for specific agent
curl -X POST http://192.168.1.10:3000/api/servers/AGENT_ID \
  -H "Content-Type: application/json" \
  -d '{"action": "update_agent"}'
```

This is what the UI "SYNC NODE" button calls.
