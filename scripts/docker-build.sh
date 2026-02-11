#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 NGINX Manager Agent - Docker Build${NC}"
echo ""

# Get version from VERSION file or default
if [ -f VERSION ]; then
    VERSION=$(cat VERSION)
else
    VERSION="0.1.0-dev"
fi

# Get build metadata
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Docker image name
DOCKER_USERNAME=${DOCKER_USERNAME:-"yourusername"}
IMAGE_NAME="nginx-manager-agent"
FULL_IMAGE="${DOCKER_USERNAME}/${IMAGE_NAME}"

echo -e "${YELLOW}Build Information:${NC}"
echo "  Version:    $VERSION"
echo "  Build Date: $BUILD_DATE"
echo "  Git Commit: $GIT_COMMIT"
echo "  Git Branch: $GIT_BRANCH"
echo "  Image:      $FULL_IMAGE:$VERSION"
echo ""

# Build the Docker image
echo -e "${BLUE}Building Docker image...${NC}"
docker build \
    --build-arg VERSION="$VERSION" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --build-arg GIT_COMMIT="$GIT_COMMIT" \
    --build-arg GIT_BRANCH="$GIT_BRANCH" \
    -t "${FULL_IMAGE}:${VERSION}" \
    -t "${FULL_IMAGE}:latest" \
    -f cmd/agent/Dockerfile \
    .

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo "Tagged as:"
echo "  - ${FULL_IMAGE}:${VERSION}"
echo "  - ${FULL_IMAGE}:latest"
echo ""

# Ask if user wants to push
read -p "Do you want to push to Docker Hub? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Pushing to Docker Hub...${NC}"
    
    # Login if not already logged in
    if ! docker info 2>/dev/null | grep -q "Username"; then
        echo "Please login to Docker Hub:"
        docker login
    fi
    
    docker push "${FULL_IMAGE}:${VERSION}"
    docker push "${FULL_IMAGE}:latest"
    
    echo ""
    echo -e "${GREEN}✓ Push complete!${NC}"
    echo ""
    echo "Pull with:"
    echo "  docker pull ${FULL_IMAGE}:${VERSION}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
