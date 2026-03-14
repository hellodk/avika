#!/bin/bash
# Local Release Script for NGINX Manager Agent
# Builds agent binaries via build-agent.sh (SKIP_DOCKER), then prepares dist/ with version.json, service file, and deploy script.

set -e

# Run from project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Configuration (all binaries go to repo root bin/)
VERSION_FILE="$PROJECT_ROOT/VERSION"
DIST_DIR="$PROJECT_ROOT/dist"
BIN_DIR="$PROJECT_ROOT/bin"

# Server URL - can be set via environment variable or deploy/.env
if [ -f "$PROJECT_ROOT/deploy/.env" ]; then
    source "$PROJECT_ROOT/deploy/.env"
fi
SERVER_URL="${SERVER_URL:-${EXTERNAL_GATEWAY_HTTP:-}}"

if [ -z "$SERVER_URL" ]; then
    echo "⚠️  SERVER_URL is not set."
    echo "   Set it via environment variable or in deploy/.env"
    echo "   Example: SERVER_URL=http://your-server:5021 ./scripts/release-local.sh"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Build agent binaries (no version bump by default; no Docker)
# User can set BUMP=patch|minor|major to bump before building
BUMP="${BUMP:-none}"
echo -e "${BLUE}📦 Building agent binaries (BUMP=${BUMP}, SKIP_DOCKER=1)...${NC}"
SKIP_GIT_CHECK=1 SKIP_DOCKER=1 BUMP="$BUMP" "$PROJECT_ROOT/scripts/build-agent.sh"

VERSION=$(cat "$VERSION_FILE")
echo -e "${BLUE}📦 Preparing dist for v${VERSION}...${NC}"

mkdir -p "$DIST_DIR"

# Create version.json (binaries under .../bin/; SERVER_URL = gateway updates base e.g. http://gateway:5021/updates)
echo -e "${BLUE}📝 Generating manifest...${NC}"

cat <<EOF > "$DIST_DIR/version.json"
{
  "version": "${VERSION}",
  "release_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "binaries": {
    "linux-amd64": {
      "url": "${SERVER_URL}/bin/agent-linux-amd64",
      "sha256": "$(cat $BIN_DIR/agent-linux-amd64.sha256)"
    },
    "linux-arm64": {
      "url": "${SERVER_URL}/bin/agent-linux-arm64",
      "sha256": "$(cat $BIN_DIR/agent-linux-arm64.sha256)"
    }
  }
}
EOF

# Copy systemd service file
echo "📦 Copying systemd service..."
cp "$PROJECT_ROOT/deploy/systemd/avika-agent.service" "$DIST_DIR/"

# Copy and customize deployment script with SERVER_URL
echo "📦 Preparing deployment script..."
cp "$PROJECT_ROOT/scripts/deploy-agent.sh" "$DIST_DIR/deploy-agent.sh"

# Extract host from SERVER_URL (remove protocol and port)
# e.g., http://gateway.example.com:5021 -> gateway.example.com
SERVER_HOST="${SERVER_URL#*://}" # Remove protocol
SERVER_HOST="${SERVER_HOST%:*}"  # Remove port

# Inject variables into deployment script
sed -i "s|UPDATE_SERVER=\"\${UPDATE_SERVER:-}\"|UPDATE_SERVER=\"\${UPDATE_SERVER:-$SERVER_URL}\"|g" "$DIST_DIR/deploy-agent.sh"
sed -i "s|GATEWAY_SERVER=\"\${GATEWAY_SERVER:-localhost:5020}\"|GATEWAY_SERVER=\"\${GATEWAY_SERVER:-${SERVER_HOST}:5020}\"|g" "$DIST_DIR/deploy-agent.sh"

chmod +x "$DIST_DIR/deploy-agent.sh"

echo ""
echo -e "${GREEN}✅ Local release prepared in ./${DIST_DIR}${NC}"
echo -e "  - Manifest: ./${DIST_DIR}/version.json"
echo -e "  - Binaries: ./${BIN_DIR}/"
echo -e "  - Service: ./${DIST_DIR}/avika-agent.service"
echo -e "  - Deployment: ./${DIST_DIR}/deploy-agent.sh"
echo ""
echo -e "${YELLOW}To start the update server, run:${NC}"
echo -e "  go run cmd/update-server/main.go"
echo ""
echo -e "${YELLOW}To deploy on a remote host (SERVER_URL = updates base, e.g. http://gateway:5021/updates):${NC}"
echo -e "  curl -fsSL $SERVER_URL/deploy-agent.sh | sudo bash"
