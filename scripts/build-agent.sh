#!/bin/bash
set -e

# Change to project root (script is in scripts/ subdirectory)
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# --- Load Configuration ---
CONFIG_FILE="$PROJECT_ROOT/scripts/build.conf"
LOCAL_CONFIG="$PROJECT_ROOT/scripts/build.conf.local"

# Default values
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_REPO="${DOCKER_REPO:-hellodk}"
BUILD_PLATFORMS="${BUILD_PLATFORMS:-linux/amd64,linux/arm64}"
K8S_DEPLOY_ENABLED="${K8S_DEPLOY_ENABLED:-true}"
AGENT_K8S_MANIFEST="${AGENT_K8S_MANIFEST:-}"

# Load config file
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Load local overrides (gitignored)
if [ -f "$LOCAL_CONFIG" ]; then
    source "$LOCAL_CONFIG"
fi

# Configuration
BINARY_NAME="agent"
OUTPUT_DIR="nginx-agent"
REPO="${DOCKER_REPO}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# --- Pre-Build Check: Block build if uncommitted changes ---
# Skip if called from build-stack.sh (already checked)
if [ "${SKIP_GIT_CHECK}" != "1" ] && [ "${CALLED_FROM_BUILD_STACK}" != "1" ]; then
    if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        if ! git diff --quiet || ! git diff --cached --quiet; then
            echo -e "${RED}❌ BUILD BLOCKED: Uncommitted changes detected!${NC}"
            echo -e "${YELLOW}Please commit your changes before building.${NC}"
            echo -e "${YELLOW}Or set SKIP_GIT_CHECK=1 to override (not recommended).${NC}"
            exit 1
        fi
    fi
fi

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
echo -e "${BLUE}🐳 Building multi-arch Docker image ${REPO}/avika-agent:${VERSION}...${NC}"
docker buildx build --platform "${BUILD_PLATFORMS}" \
    --build-arg VERSION="${VERSION}" \
    --build-arg BUILD_DATE="${BUILD_DATE}" \
    --build-arg GIT_COMMIT="${GIT_COMMIT}" \
    --build-arg GIT_BRANCH="${GIT_BRANCH}" \
    -t "${REPO}/avika-agent:${VERSION}" \
    -t "${REPO}/avika-agent:latest" \
    --push "$OUTPUT_DIR" || echo -e "${YELLOW}⚠️  Docker buildx failed (non-fatal)${NC}"

# Deploy to Kubernetes (non-fatal, optional)
if [ "${K8S_DEPLOY_ENABLED}" = "true" ] && [ -n "${AGENT_K8S_MANIFEST}" ] && [ -f "${AGENT_K8S_MANIFEST}" ]; then
    echo ""
    echo -e "${BLUE}☸️  Applying Kubernetes manifest (tag: ${VERSION})...${NC}"
    export IMAGE_TAG="${VERSION}"
    envsubst '${IMAGE_TAG}' < "${AGENT_K8S_MANIFEST}" | kubectl apply -f - \
        || echo -e "${YELLOW}⚠️  kubectl apply failed (non-fatal)${NC}"
elif [ -n "${AGENT_K8S_MANIFEST}" ] && [ ! -f "${AGENT_K8S_MANIFEST}" ]; then
    echo -e "${YELLOW}⚠️  AGENT_K8S_MANIFEST set but file not found: ${AGENT_K8S_MANIFEST}${NC}"
fi

echo ""
echo -e "${GREEN}✅ Done!${NC}"
echo "Image: ${REPO}/avika-agent:${VERSION}"
