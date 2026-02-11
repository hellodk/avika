#!/bin/bash
# Local Release Script for NGINX Manager Agent

set -e

# Configuration
VERSION_FILE="VERSION"
DIST_DIR="dist"
SERVER_URL="http://localhost:8090" # Change this to your server IP for remote agents

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

# Create dist directory
mkdir -p "$DIST_DIR/bin"

build_agent() {
    local os=$1
    local arch=$2
    local target="$DIST_DIR/bin/agent-${os}-${arch}"
    
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

# Create version.json
echo -e "${BLUE}📝 Generating manifest...${NC}"

cat <<EOF > "$DIST_DIR/version.json"
{
  "version": "${VERSION}",
  "release_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "binaries": {
    "linux-amd64": {
      "url": "${SERVER_URL}/bin/agent-linux-amd64",
      "sha256": "$(cat $DIST_DIR/bin/agent-linux-amd64.sha256)"
    },
    "linux-arm64": {
      "url": "${SERVER_URL}/bin/agent-linux-arm64",
      "sha256": "$(cat $DIST_DIR/bin/agent-linux-arm64.sha256)"
    }
  }
}
EOF

# Copy deployment script
echo "📦 Copying deployment script..."
cp scripts/deploy-agent.sh "$DIST_DIR/deploy-agent.sh"
chmod +x "$DIST_DIR/deploy-agent.sh"

echo ""
echo -e "${GREEN}✅ Local release prepared in ./${DIST_DIR}${NC}"
echo -e "  - Manifest: ./${DIST_DIR}/version.json"
echo -e "  - Binaries: ./${DIST_DIR}/bin/"
echo -e "  - Deployment: ./${DIST_DIR}/deploy-agent.sh"
echo ""
echo -e "${YELLOW}To start the update server, run:${NC}"
echo -e "  go run cmd/update-server/main.go"
echo ""
echo -e "${YELLOW}To deploy on a remote host:${NC}"
echo -e "  curl -fsSL http://192.168.1.10:8090/deploy-agent.sh | sudo bash"
