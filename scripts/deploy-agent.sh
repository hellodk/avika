#!/bin/bash
set -e

# Avika Agent Deployment Script
# This script downloads and installs the Avika NGINX Manager Agent

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

# Configuration - can be overridden via environment variables
# Auto-detect UPDATE_SERVER from where this script is being downloaded
# If piped from curl, try to extract from the URL
if [ -z "$UPDATE_SERVER" ]; then
    # Try to detect from process arguments (works when piped from curl)
    CURL_URL=$(ps aux | grep -E "curl.*deploy-agent.sh" | grep -v grep | sed -n 's/.*curl.*\(http[s]*:\/\/[^\/]*\).*/\1/p' | head -1)
    if [ -n "$CURL_URL" ]; then
        UPDATE_SERVER="$CURL_URL"
        log_info "Auto-detected UPDATE_SERVER: $UPDATE_SERVER"
    fi
fi

# Example: GATEWAY_SERVER=<GATEWAY_HOST>:5020 UPDATE_SERVER=http://<GATEWAY_HOST>:5021 ./deploy-agent.sh
UPDATE_SERVER="${UPDATE_SERVER:-}"
GATEWAY_SERVER="${GATEWAY_SERVER:-localhost:50051}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/avika"
SERVICE_NAME="avika-agent"
AGENT_USER="${AGENT_USER:-root}"

# Validate required configuration
if [ -z "$UPDATE_SERVER" ]; then
    log_error "UPDATE_SERVER environment variable is required"
    log_error "Example: curl -fsSL http://<GATEWAY_HOST>:5021/deploy-agent.sh | UPDATE_SERVER=http://<GATEWAY_HOST>:5021 GATEWAY_SERVER=<GATEWAY_HOST>:5020 sudo -E bash"
    exit 1
fi

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
cat > "$CONFIG_DIR/avika-agent.conf" <<EOF
# Avika Agent Configuration
# Generated on $(date)

# Gateway Server(s) - comma-separated for multi-gateway
GATEWAYS="$GATEWAY_SERVER"

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

chmod 644 "$CONFIG_DIR/avika-agent.conf"
log_success "Configuration file created at $CONFIG_DIR/avika-agent.conf"

# Download systemd service file
log_info "Downloading systemd service file..."
SERVICE_URL="${UPDATE_SERVER}/avika-agent.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if curl -sLf "$SERVICE_URL" -o "$SERVICE_FILE"; then
    log_success "Service file downloaded to $SERVICE_FILE"
else
    log_error "Failed to download service file from $SERVICE_URL"
    exit 1
fi

# Ensure correct permissions
chmod 644 "$SERVICE_FILE"

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
    echo "  Edit config:      nano $CONFIG_DIR/avika-agent.conf"
    echo ""
    log_success "Avika Agent deployment completed successfully!"
else
    log_error "Service failed to start!"
    log_error "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi
