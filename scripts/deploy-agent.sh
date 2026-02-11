#!/bin/bash
set -e

# Avika Agent Deployment Script
# This script downloads and installs the Avika NGINX Manager Agent

# Configuration
UPDATE_SERVER="${UPDATE_SERVER:-http://192.168.1.10:8090}"
GATEWAY_SERVER="${GATEWAY_SERVER:-192.168.1.10:50051}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/avika-agent"
SERVICE_NAME="avika-agent"
AGENT_USER="${AGENT_USER:-root}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ $EUID -ne 0 ]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Starting Avika Agent deployment..."
log_info "Update Server: $UPDATE_SERVER"
log_info "Gateway Server: $GATEWAY_SERVER"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        BINARY_NAME="agent-linux-amd64"
        ;;
    aarch64|arm64)
        BINARY_NAME="agent-linux-arm64"
        ;;
    *)
        log_error "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

log_info "Detected architecture: $ARCH (binary: $BINARY_NAME)"

# Create configuration directory
log_info "Creating configuration directory..."
mkdir -p "$CONFIG_DIR"
mkdir -p /var/lib/nginx-manager/backups
mkdir -p /var/lib/avika-agent
mkdir -p /var/log/avika-agent

# Download version manifest
log_info "Fetching latest version information..."
VERSION_JSON=$(curl -fsSL "$UPDATE_SERVER/version.json" || {
    log_error "Failed to fetch version manifest from $UPDATE_SERVER/version.json"
    log_error "Is the update server running?"
    exit 1
})

LATEST_VERSION=$(echo "$VERSION_JSON" | grep -o '"version":"[^"]*' | cut -d'"' -f4)
DOWNLOAD_URL="$UPDATE_SERVER/bin/$BINARY_NAME"
CHECKSUM_URL="$UPDATE_SERVER/bin/${BINARY_NAME}.sha256"

log_info "Latest version: $LATEST_VERSION"

# Download the agent binary
log_info "Downloading agent binary..."
TMP_BINARY="/tmp/${BINARY_NAME}.tmp"
curl -fsSL "$DOWNLOAD_URL" -o "$TMP_BINARY" || {
    log_error "Failed to download agent binary from $DOWNLOAD_URL"
    exit 1
}

# Download and verify checksum
log_info "Verifying checksum..."
EXPECTED_CHECKSUM=$(curl -fsSL "$CHECKSUM_URL" | awk '{print $1}')
ACTUAL_CHECKSUM=$(sha256sum "$TMP_BINARY" | awk '{print $1}')

if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
    log_error "Checksum verification failed!"
    log_error "Expected: $EXPECTED_CHECKSUM"
    log_error "Got:      $ACTUAL_CHECKSUM"
    rm -f "$TMP_BINARY"
    exit 1
fi

log_success "Checksum verified successfully"

# Stop existing service if running
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_info "Stopping existing $SERVICE_NAME service..."
    systemctl stop "$SERVICE_NAME"
fi

# Install the binary
log_info "Installing agent binary to $INSTALL_DIR/avika-agent..."
chmod +x "$TMP_BINARY"
mv "$TMP_BINARY" "$INSTALL_DIR/avika-agent"

# Verify installation
INSTALLED_VERSION=$("$INSTALL_DIR/avika-agent" -version | grep "Version:" | awk '{print $2}')
log_success "Installed version: $INSTALLED_VERSION"

# Create configuration file
log_info "Creating configuration file..."
cat > "$CONFIG_DIR/agent.conf" <<EOF
# Avika Agent Configuration
# Generated on $(date)

# Gateway Server
GATEWAY_SERVER="$GATEWAY_SERVER"

# Agent Identity (leave empty for auto-detection: hostname-ip)
AGENT_ID=""

# Health Check Port
HEALTH_PORT=8080

# Self-Update Configuration
UPDATE_SERVER="$UPDATE_SERVER"
UPDATE_INTERVAL="168h"

# NGINX Configuration
NGINX_STATUS_URL="http://127.0.0.1/nginx_status"
ACCESS_LOG_PATH="/var/log/nginx/access.log"
ERROR_LOG_PATH="/var/log/nginx/error.log"
LOG_FORMAT="combined"

# Buffer Directory
BUFFER_DIR="/var/lib/avika-agent/"

# Backup Directory
BACKUP_DIR="/var/lib/nginx-manager/backups"

# Logging
LOG_LEVEL="info"
LOG_FILE="/var/log/avika-agent/agent.log"
EOF

chmod 644 "$CONFIG_DIR/agent.conf"
log_success "Configuration file created at $CONFIG_DIR/agent.conf"

# Create systemd service file
log_info "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Avika NGINX Manager Agent
Documentation=https://github.com/hellodk/nginx-manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$AGENT_USER
Group=$AGENT_USER

# Load configuration
EnvironmentFile=$CONFIG_DIR/agent.conf

# Execute agent with configuration
ExecStart=$INSTALL_DIR/avika-agent \\
    -server \${GATEWAY_SERVER} \\
    -id "\${AGENT_ID}" \\
    -health-port \${HEALTH_PORT} \\
    -update-server "\${UPDATE_SERVER}" \\
    -update-interval \${UPDATE_INTERVAL} \\
    -nginx-status-url "\${NGINX_STATUS_URL}" \\
    -access-log-path "\${ACCESS_LOG_PATH}" \\
    -error-log-path "\${ERROR_LOG_PATH}" \\
    -log-format "\${LOG_FORMAT}" \\
    -buffer-dir "\${BUFFER_DIR}" \\
    -log-level "\${LOG_LEVEL}" \\
    -log-file "\${LOG_FILE}"

# Restart policy
Restart=on-failure
RestartSec=10s
StartLimitInterval=0

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/nginx-manager /var/lib/avika-agent /var/log/avika-agent /etc/nginx

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "/etc/systemd/system/${SERVICE_NAME}.service"
log_success "Systemd service created"

# Reload systemd
log_info "Reloading systemd daemon..."
systemctl daemon-reload

# Enable and start service
log_info "Enabling $SERVICE_NAME service..."
systemctl enable "$SERVICE_NAME"

log_info "Starting $SERVICE_NAME service..."
systemctl start "$SERVICE_NAME"

# Wait a moment for service to start
sleep 2

# Check service status
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_success "Service started successfully!"
    echo ""
    log_info "Service Status:"
    systemctl status "$SERVICE_NAME" --no-pager -l | head -15
    echo ""
    log_info "Useful commands:"
    echo "  View logs:        journalctl -u $SERVICE_NAME -f"
    echo "  Restart service:  systemctl restart $SERVICE_NAME"
    echo "  Stop service:     systemctl stop $SERVICE_NAME"
    echo "  Service status:   systemctl status $SERVICE_NAME"
    echo "  Edit config:      nano $CONFIG_DIR/agent.conf"
    echo ""
    log_success "Avika Agent deployment completed successfully!"
else
    log_error "Service failed to start!"
    log_error "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi
