#!/bin/bash
set -e

# Change to project root (script is in scripts/ subdirectory)
cd "$(dirname "$0")/.."

# Configuration
BINARY_NAME="agent"
OUTPUT_DIR="nginx-agent"
# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get Version
VERSION_FILE="VERSION"
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

# Get build metadata
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

LDFLAGS="-X 'main.Version=${VERSION}' \
         -X 'main.BuildDate=${BUILD_DATE}' \
         -X 'main.GitCommit=${GIT_COMMIT}' \
         -X 'main.GitBranch=${GIT_BRANCH}'"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Building Agent ${VERSION}..."

# Build for Linux AMD64
echo "Building for linux/amd64..."
GOOS=linux GOARCH=amd64 go build -ldflags "$LDFLAGS" -o "$OUTPUT_DIR/${BINARY_NAME}-linux-amd64" ./cmd/agent

# Build for Linux ARM64
echo "Building for linux/arm64..."
GOOS=linux GOARCH=arm64 go build -ldflags "$LDFLAGS" -o "$OUTPUT_DIR/${BINARY_NAME}-linux-arm64" ./cmd/agent

echo "Build complete. Artifacts in $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"

# Build and push multi-arch Docker image (non-fatal)
echo ""
echo -e "${BLUE}🐳 Building multi-arch Docker image hellodk/nginx-with-agent:${VERSION}...${NC}"
docker buildx build --platform linux/amd64,linux/arm64 \
    -t "hellodk/nginx-with-agent:${VERSION}" \
    --push "$OUTPUT_DIR" || echo -e "${YELLOW}⚠️  Docker buildx failed (non-fatal)${NC}"

# Deploy to Kubernetes (non-fatal)
echo ""
echo -e "${BLUE}☸️  Applying Kubernetes manifest (tag: ${VERSION})...${NC}"
export IMAGE_TAG="${VERSION}"
envsubst '${IMAGE_TAG}' < /home/dk/Documents/git/dumpyard/kubernetes/utilities/nginx-lab-with-agent.yaml | kubectl apply -f - \
    || echo -e "${YELLOW}⚠️  kubectl apply failed (non-fatal)${NC}"

echo ""
echo -e "${GREEN}✅ Done!${NC}"
