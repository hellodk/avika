# How to Find the Latest Avika Agent Version

## Quick Methods

### 1. **From Update Server** (Recommended)

```bash
# Query the version manifest
curl http://192.168.1.10:8090/version.json

# Output:
# {
#   "version": "0.2.0",
#   "release_date": "2026-02-10T18:20:00Z",
#   "binaries": { ... }
# }

# Extract just the version
curl -s http://192.168.1.10:8090/version.json | grep -o '"version":"[^"]*' | cut -d'"' -f4
```

### 2. **From System Health UI**

1. Open `http://192.168.1.10:3000/system`
2. Look at any agent's "Orchestration Trace" column
3. If you see **"UPDATE AVAILABLE"** badge → hover to see latest version
4. The UI automatically fetches from `http://192.168.1.10:8090/version.json`

### 3. **From Source Code**

```bash
# Check the VERSION file
cat VERSION

# Or check git tags
git describe --tags --abbrev=0
```

### 4. **From Installed Agent**

```bash
# Check currently installed version
/usr/local/bin/avika-agent -version

# Output:
# NGINX Manager Agent
# Version:    0.1.0-dev
# Build Date: 2026-02-10
# Git Commit: abc1234
# Git Branch: main
```

### 5. **From Release Directory**

```bash
# After running release script
cat dist/version.json

# Or check the binaries
ls -lh dist/bin/
# agent-linux-amd64
# agent-linux-amd64.sha256
# agent-linux-arm64
# agent-linux-arm64.sha256
```

## Detailed Comparison

### Check All Versions at Once

```bash
#!/bin/bash
echo "=== Avika Agent Version Check ==="
echo ""

# 1. Source code version
echo "📦 Source Version:"
cat VERSION
echo ""

# 2. Update server version
echo "🌐 Update Server (Latest Available):"
curl -s http://192.168.1.10:8090/version.json | grep -o '"version":"[^"]*' | cut -d'"' -f4
echo ""

# 3. Installed agent version
echo "💻 Installed Agent:"
/usr/local/bin/avika-agent -version 2>/dev/null | grep "Version:" | awk '{print $2}' || echo "Not installed"
echo ""

# 4. Running agent version (from systemd)
echo "🏃 Running Agent:"
systemctl show avika-agent -p ExecStart 2>/dev/null | grep -o 'avika-agent' && \
    journalctl -u avika-agent -n 1 --no-pager 2>/dev/null | grep -o 'version [^ ]*' | head -1 || echo "Not running"
```

## Version Information Sources

| Source | Location | Command |
|--------|----------|---------|
| **Source Code** | `VERSION` file | `cat VERSION` |
| **Update Server** | `http://192.168.1.10:8090/version.json` | `curl http://192.168.1.10:8090/version.json` |
| **Installed Binary** | `/usr/local/bin/avika-agent` | `/usr/local/bin/avika-agent -version` |
| **System Health UI** | `http://192.168.1.10:3000/system` | Check agent table |
| **Git Tags** | Repository | `git describe --tags` |
| **Release Dist** | `dist/version.json` | `cat dist/version.json` |

## Understanding Version Numbers

Avika Agent uses semantic versioning: `MAJOR.MINOR.PATCH`

```
0.2.0
│ │ │
│ │ └─ Patch: Bug fixes, minor changes
│ └─── Minor: New features, backward compatible
└───── Major: Breaking changes
```

Examples:
- `0.1.0-dev` → Development build
- `0.1.0` → First stable release
- `0.2.0` → New features added
- `1.0.0` → Production-ready, stable API

## Checking Version from Different Locations

### From Gateway Server

```bash
# Query all connected agents
curl http://192.168.1.10:3000/api/servers | jq '.[] | {hostname, version: .agent_version}'
```

### From Agent Host

```bash
# Check service status
systemctl status avika-agent

# Check logs for version
journalctl -u avika-agent | grep -i "version"

# Direct binary check
/usr/local/bin/avika-agent -version
```

### From Update Server Host

```bash
# Check what's being served
cd /path/to/nginx-manager
cat dist/version.json

# Verify binaries exist
ls -lh dist/bin/agent-*
```

## Automated Version Monitoring

### Create a Version Check Script

```bash
#!/bin/bash
# save as: /usr/local/bin/check-avika-version

LATEST=$(curl -s http://192.168.1.10:8090/version.json | grep -o '"version":"[^"]*' | cut -d'"' -f4)
CURRENT=$(/usr/local/bin/avika-agent -version 2>/dev/null | grep "Version:" | awk '{print $2}')

echo "Current: $CURRENT"
echo "Latest:  $LATEST"

if [ "$CURRENT" != "$LATEST" ]; then
    echo "⚠️  Update available!"
    exit 1
else
    echo "✅ Up to date"
    exit 0
fi
```

### Add to Cron (Optional)

```bash
# Check daily at 9 AM
0 9 * * * /usr/local/bin/check-avika-version && echo "Agent up-to-date" || echo "Agent needs update" | mail -s "Avika Agent Update Check" admin@example.com
```

## Troubleshooting

### Update Server Not Responding

```bash
# Check if update server is running
curl -I http://192.168.1.10:8090/version.json

# Expected: HTTP/1.1 200 OK
# If not, start the server:
cd /path/to/nginx-manager
go run cmd/update-server/main.go
```

### Version Mismatch After Update

```bash
# 1. Check if binary was actually replaced
ls -lh /usr/local/bin/avika-agent

# 2. Check service is using correct binary
systemctl cat avika-agent | grep ExecStart

# 3. Restart service
sudo systemctl restart avika-agent

# 4. Verify new version
/usr/local/bin/avika-agent -version
```

### UI Shows Wrong Version

```bash
# 1. Check agent is reporting correct version
journalctl -u avika-agent -n 20 | grep version

# 2. Restart agent to force re-registration
sudo systemctl restart avika-agent

# 3. Refresh UI (Ctrl+Shift+R)
```

## Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║              AVIKA AGENT VERSION REFERENCE                   ║
╚══════════════════════════════════════════════════════════════╝

📦 LATEST AVAILABLE VERSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -s http://192.168.1.10:8090/version.json | \
  grep -o '"version":"[^"]*' | cut -d'"' -f4

💻 INSTALLED VERSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/usr/local/bin/avika-agent -version

🌐 UI CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
http://192.168.1.10:3000/system
(Look for "UPDATE AVAILABLE" or "UP-TO-DATE" badges)

📝 SOURCE VERSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat VERSION
```

## Summary

**Fastest way to check latest version:**
```bash
curl -s http://192.168.1.10:8090/version.json | grep version
```

**Fastest way to check installed version:**
```bash
/usr/local/bin/avika-agent -version
```

**Easiest way (UI):**
Open `http://192.168.1.10:3000/system` and look at the agent table badges.
