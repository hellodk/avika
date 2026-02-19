#!/bin/bash
# Avika Agent - Quick Deployment Reference

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════╗
║                    AVIKA AGENT DEPLOYMENT                            ║
╚══════════════════════════════════════════════════════════════════════╝

📦 ONE-LINE DEPLOYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -fsSL http://<GATEWAY_HOST>:5021/deploy-agent.sh | \
     GATEWAY_SERVER=<GATEWAY_HOST>:5020 \
     UPDATE_SERVER=http://<GATEWAY_HOST>:5021 sudo -E bash

🔧 CUSTOM DEPLOYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
sudo GATEWAY_SERVER="your-gateway:5020" \
     UPDATE_SERVER="http://your-gateway:5021" \
     ./deploy-agent.sh

📋 SERVICE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:   sudo systemctl status avika-agent
Logs:     sudo journalctl -u avika-agent -f
Restart:  sudo systemctl restart avika-agent
Stop:     sudo systemctl stop avika-agent
Config:   sudo nano /etc/avika/avika-agent.conf

🔍 TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Version:  /usr/local/bin/avika-agent -version
Logs:     sudo journalctl -u avika-agent -n 100 --no-pager
Test:     sudo /usr/local/bin/avika-agent -server <GATEWAY_HOST>:5020 -id test

📂 FILE LOCATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Binary:   /usr/local/bin/avika-agent
Config:   /etc/avika/avika-agent.conf
Service:  /etc/systemd/system/avika-agent.service
Logs:     /var/log/avika-agent/agent.log
Buffer:   /var/lib/avika-agent/
Backups:  /var/lib/nginx-manager/backups/

🔐 SECURITY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Checksum verification on download
✓ Systemd security hardening (NoNewPrivileges, PrivateTmp)
✓ Automatic self-updates with verification
✓ Read-only system directories
✓ Explicit write permissions

🚀 SELF-UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Automatic:  Every week (configurable)
Manual:     Click "SYNC NODE" in System Health UI
Verify:     /usr/local/bin/avika-agent -version

📚 DOCUMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full Guide: docs/AGENT_DEPLOYMENT.md
Agent Docs: cmd/agent/README.md

EOF
