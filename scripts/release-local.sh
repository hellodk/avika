#!/bin/bash
# Local Release Script for NGINX Manager Agent

set -e

# Configuration (all binaries go to repo root bin/)
VERSION_FILE="VERSION"
DIST_DIR="dist"
BIN_DIR="bin"

# Server URL - can be set via environment variable or deploy/.env
# Default: empty (will prompt if not set)
if [ -f "deploy/.env" ]; then
    source deploy/.env
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

# Get Version
if [ ! -f "$VERSION_FILE" ]; then
    echo "0.1.0" > "$VERSION_FILE"
fi
CURRENT_VERSION=$(cat "$VERSION_FILE")

# Auto-bump version (default: patch)
BUMP_TYPE=${BUMP:-patch}

if [ "$BUMP_TYPE" != "none" ]; then
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
    
    case "$BUMP_TYPE" in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
        *)
            echo -e "${YELLOW}⚠️  Invalid BUMP type: $BUMP_TYPE (use: major, minor, patch, none)${NC}"
            exit 1
            ;;
    esac
    
    VERSION="$MAJOR.$MINOR.$PATCH"
    echo "$VERSION" > "$VERSION_FILE"
    echo -e "${GREEN}📈 Version bumped: $CURRENT_VERSION → $VERSION${NC}"
else
    VERSION="$CURRENT_VERSION"
    echo -e "${YELLOW}📌 Version unchanged: $VERSION${NC}"
fi

echo -e "${BLUE}📦 Starting Local Release Process (v${VERSION})${NC}"

# Create repo root bin directory for all agent binaries
mkdir -p "$BIN_DIR"

build_agent() {
    local os=$1
    local arch=$2
    local target="$BIN_DIR/agent-${os}-${arch}"
    
    echo -e "  🛠️  Building for ${os}/${arch}..."
    
    GOOS=$os GOARCH=$arch go build -ldflags="-w -s \
        -X 'main.Version=${VERSION}' \
        -X 'main.BuildDate=$(date -u +%Y-%m-%dT%H:%M:%SZ)' \
        -X 'main.GitCommit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")' \
        -X 'main.GitBranch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")'" \
        -o "$target" ./cmd/agent
        
    # Generate SHA256
    sha256sum "$target" | awk '{print $1}' > "${target}.sha256"
}

# Build for supported platforms
build_agent "linux" "amd64"
build_agent "linux" "arm64"

# Create version.json (binaries are always under .../bin/; use SERVER_URL = gateway updates base e.g. http://gateway:5021/updates)
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
cp deploy/systemd/avika-agent.service "$DIST_DIR/"

# Copy and customize deployment script with SERVER_URL
echo "📦 Preparing deployment script..."
cp scripts/deploy-agent.sh "$DIST_DIR/deploy-agent.sh"

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
