#!/bin/bash
set -e

# Change to project root (script is in scripts/ subdirectory)
cd "$(dirname "$0")/.."

# Configuration
REPO="hellodk"
VERSION_FILE="VERSION"
AGENT_DIR="nginx-agent"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🏗️  Avika - Full Stack Build System${NC}"
echo "========================================"

# --- 1. Versioning Logic ---
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

# --- 2. Build Metadata ---
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

LDFLAGS="-X 'main.Version=${VERSION}' \
         -X 'main.BuildDate=${BUILD_DATE}' \
         -X 'main.GitCommit=${GIT_COMMIT}' \
         -X 'main.GitBranch=${GIT_BRANCH}'"

# --- 2b. Update Helm Chart Versions ---
CHART_FILE="deploy/helm/avika/Chart.yaml"
VALUES_FILE="deploy/helm/avika/values.yaml"

if [ -f "$CHART_FILE" ]; then
    # Update appVersion to match the application version
    sed -i "s/^appVersion:.*/appVersion: \"${VERSION}\"/" "$CHART_FILE"
    
    # Optionally sync chart version with app version (or manage separately)
    # For simplicity, we keep chart version in sync with app version
    sed -i "s/^version:.*/version: ${VERSION}/" "$CHART_FILE"
    
    echo -e "${GREEN}📋 Helm Chart.yaml updated: version=${VERSION}, appVersion=${VERSION}${NC}"
fi

if [ -f "$VALUES_FILE" ]; then
    # Update image tags in values.yaml for all Avika components
    # Note: Third-party images like otel-collector, updateServer, aiEngine, logAggregator
    # are intentionally NOT updated as they use their own versioning
    
    # Update component image tags using section-aware sed
    for component in gateway agent frontend mockNginx; do
        sed -i "/^${component}:/,/^[a-z]/{s/^\(\s*tag:\s*\).*/\1\"${VERSION}\"/}" "$VALUES_FILE"
    done
    
    # Update global image section tag
    sed -i '/^image:/,/^[a-z]/{s/^\(\s*tag:\s*\).*/\1"'"${VERSION}"'"/}' "$VALUES_FILE"
    
    echo -e "${GREEN}📋 Helm values.yaml updated: Avika component image tags → ${VERSION}${NC}"
fi

# --- 3. Build Agent (via build-agent.sh) ---
echo -e "\n${BLUE}📦 Building Agent (nginx + agent bundled image)...${NC}"
BUMP=none ./scripts/build-agent.sh || {
    echo -e "${RED}❌ Agent build failed${NC}"
    exit 1
}

# --- 4. Docker Build & Push Logic ---
# Function to build and push multi-arch images
build_image() {
    local context=$1
    local image_name=$2
    local dockerfile=$3
    
    echo -e "\n${BLUE}🐳 Building multi-arch image: ${REPO}/${image_name}:${VERSION}...${NC}"
    
    # We use --push to push to registry. Ensure you are logged in.
    # We use --platform linux/amd64,linux/arm64
    docker buildx build --platform linux/amd64,linux/arm64 \
        --build-arg VERSION="${VERSION}" \
        --build-arg BUILD_DATE="${BUILD_DATE}" \
        --build-arg GIT_COMMIT="${GIT_COMMIT}" \
        --build-arg GIT_BRANCH="${GIT_BRANCH}" \
        -t "${REPO}/${image_name}:${VERSION}" \
        -t "${REPO}/${image_name}:latest" \
        -f "$dockerfile" \
        --push "$context" || {
            echo -e "${RED}❌ Build failed for ${image_name}${NC}"
            return 1
        }
    echo -e "${GREEN}✅ Successfully built and pushed ${REPO}/${image_name}:${VERSION}${NC}"
}

# Ensure buildx is ready
echo -e "\n${BLUE}🔧 Checking Docker Buildx...${NC}"
docker buildx create --use --name avika-builder 2>/dev/null || docker buildx use avika-builder

# --- 5. Build remaining components (agent already built above) ---

# Gateway
build_image "." "gateway" "cmd/gateway/Dockerfile"

# Frontend
build_image "frontend" "avika-frontend" "frontend/Dockerfile"

# --- 6. Deploy to Kubernetes ---
echo -e "\n${BLUE}☸️  Deploying to Kubernetes...${NC}"

# Update Helm values with new version
sed -i "s/tag: \".*\"/tag: \"${VERSION}\"/" deploy/helm/avika/values.yaml 2>/dev/null || true

# Deploy using Helm
helm upgrade avika ./deploy/helm/avika -n avika \
    --set postgresql.auth.password=avika123 \
    --set clickhouse.password=avika123 \
    --set mockNginx.image.tag="${VERSION}" \
    --set gateway.image.tag="${VERSION}" \
    --set frontend.image.tag="${VERSION}" \
    --set agent.image.tag="${VERSION}" \
    || echo -e "${YELLOW}⚠️  Helm upgrade failed (non-fatal)${NC}"

# --- 7. Cleanup to save disk space ---
echo -e "\n${BLUE}🧹 Cleaning up to save disk space...${NC}"

# Remove dangling images (untagged images from build process)
docker image prune -f 2>/dev/null || true

# Remove buildx cache older than 24 hours
docker buildx prune --keep-storage 2GB -f 2>/dev/null || true

# Remove old versions of our images (keep only current and latest)
for image_name in avika-agent gateway avika-frontend; do
    # Get all tags except current version and latest
    old_tags=$(docker images "${REPO}/${image_name}" --format "{{.Tag}}" 2>/dev/null | grep -v -E "^(${VERSION}|latest)$" || true)
    for tag in $old_tags; do
        echo -e "${YELLOW}  Removing old image: ${REPO}/${image_name}:${tag}${NC}"
        docker rmi "${REPO}/${image_name}:${tag}" 2>/dev/null || true
    done
done

echo -e "${GREEN}✅ Cleanup completed${NC}"

echo -e "\n${GREEN}🏁 All builds completed successfully! (Version: ${VERSION})${NC}"
echo "--------------------------------------------------------"
echo "Images pushed:"
echo "  - ${REPO}/avika-agent:${VERSION} (via build-agent.sh)"
echo "  - ${REPO}/gateway:${VERSION}"
echo "  - ${REPO}/avika-frontend:${VERSION}"
echo "--------------------------------------------------------"
