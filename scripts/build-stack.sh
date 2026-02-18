#!/bin/bash
set -e

# Change to project root (script is in scripts/ subdirectory)
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# --- Load Configuration ---
CONFIG_FILE="$PROJECT_ROOT/scripts/build.conf"
LOCAL_CONFIG="$PROJECT_ROOT/scripts/build.conf.local"

# Default values (can be overridden by config files)
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_REPO="${DOCKER_REPO:-hellodk}"
K8S_NAMESPACE="${K8S_NAMESPACE:-avika}"
K8S_DEPLOY_ENABLED="${K8S_DEPLOY_ENABLED:-true}"
BUILD_PLATFORMS="${BUILD_PLATFORMS:-linux/amd64,linux/arm64}"
BUILDX_BUILDER_NAME="${BUILDX_BUILDER_NAME:-avika-builder}"
BUILD_COMPONENTS="${BUILD_COMPONENTS:-agent gateway frontend}"

# Load config file
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Load local overrides (gitignored)
if [ -f "$LOCAL_CONFIG" ]; then
    source "$LOCAL_CONFIG"
fi

# Computed values
REPO="${DOCKER_REPO}"
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
echo -e "${BLUE}Config: DOCKER_REPO=${DOCKER_REPO}, K8S_NAMESPACE=${K8S_NAMESPACE}${NC}"

# --- Pre-Build Check: Block build if uncommitted changes ---
echo -e "\n${BLUE}🔍 Pre-build check: Verifying git status...${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}❌ Not a git repository. Builds require version control.${NC}"
    exit 1
fi

# Check for uncommitted changes (staged or unstaged)
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}❌ BUILD BLOCKED: Uncommitted changes detected!${NC}"
    echo ""
    echo -e "${YELLOW}Modified files:${NC}"
    git status --short
    echo ""
    echo -e "${YELLOW}Please commit your changes before building:${NC}"
    echo "  git add ."
    echo "  git commit -m 'your commit message'"
    echo ""
    echo -e "${YELLOW}Or to skip this check (not recommended):${NC}"
    echo "  SKIP_GIT_CHECK=1 ./scripts/build-stack.sh"
    
    # Allow override with SKIP_GIT_CHECK=1
    if [ "${SKIP_GIT_CHECK}" != "1" ]; then
        exit 1
    fi
    echo -e "${YELLOW}⚠️  SKIP_GIT_CHECK=1 set, proceeding anyway...${NC}"
fi

# Check for untracked files that might be important
UNTRACKED=$(git ls-files --others --exclude-standard | grep -E '\.(go|ts|tsx|js|jsx|yaml|yml|sh|Dockerfile)$' || true)
if [ -n "$UNTRACKED" ]; then
    echo -e "${YELLOW}⚠️  Warning: Untracked source files detected:${NC}"
    echo "$UNTRACKED" | head -10
    if [ $(echo "$UNTRACKED" | wc -l) -gt 10 ]; then
        echo "  ... and more"
    fi
    echo ""
fi

echo -e "${GREEN}✅ Git status check passed${NC}"

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
HELM_CHART_DIR="${HELM_CHART_DIR:-deploy/helm/avika}"
CHART_FILE="${HELM_CHART_DIR}/Chart.yaml"
VALUES_FILE="${HELM_CHART_DIR}/values.yaml"

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
BUMP=none CALLED_FROM_BUILD_STACK=1 ./scripts/build-agent.sh || {
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
    docker buildx build --platform "${BUILD_PLATFORMS}" \
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
docker buildx create --use --name "${BUILDX_BUILDER_NAME}" 2>/dev/null || docker buildx use "${BUILDX_BUILDER_NAME}"

# --- 5. Build remaining components (agent already built above) ---

# Gateway
build_image "." "gateway" "cmd/gateway/Dockerfile"

# Frontend
build_image "frontend" "avika-frontend" "frontend/Dockerfile"

# --- 6. Deploy to Kubernetes ---
if [ "${K8S_DEPLOY_ENABLED}" = "true" ]; then
    echo -e "\n${BLUE}☸️  Deploying to Kubernetes (namespace: ${K8S_NAMESPACE})...${NC}"

    # Update Helm values with new version
    sed -i "s/tag: \".*\"/tag: \"${VERSION}\"/" deploy/helm/avika/values.yaml 2>/dev/null || true

    # Build helm set arguments for image tags
    HELM_SET_ARGS=(
        "--set" "mockNginx.image.tag=${VERSION}"
        "--set" "gateway.image.tag=${VERSION}"
        "--set" "frontend.image.tag=${VERSION}"
        "--set" "agent.image.tag=${VERSION}"
    )
    
    # Add password overrides from environment if provided (avoid hardcoding)
    if [ -n "${POSTGRES_PASSWORD}" ]; then
        HELM_SET_ARGS+=("--set" "postgresql.auth.password=${POSTGRES_PASSWORD}")
    fi
    if [ -n "${CLICKHOUSE_PASSWORD}" ]; then
        HELM_SET_ARGS+=("--set" "clickhouse.password=${CLICKHOUSE_PASSWORD}")
    fi

    # Deploy using Helm
    helm upgrade avika ./deploy/helm/avika -n "${K8S_NAMESPACE}" \
        "${HELM_SET_ARGS[@]}" \
        || echo -e "${YELLOW}⚠️  Helm upgrade failed (non-fatal)${NC}"
else
    echo -e "\n${YELLOW}⏭️  Kubernetes deployment disabled (K8S_DEPLOY_ENABLED=${K8S_DEPLOY_ENABLED})${NC}"
fi

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
