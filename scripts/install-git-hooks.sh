#!/bin/bash
# Install git hooks for Avika project

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Change to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

echo -e "${BLUE}🔧 Installing Git Hooks for Avika...${NC}"

# Create hooks directory if it doesn't exist
HOOKS_DIR=".git/hooks"
if [ ! -d "$HOOKS_DIR" ]; then
    echo -e "${YELLOW}⚠️  .git/hooks directory not found. Are you in a git repository?${NC}"
    exit 1
fi

# Create post-commit hook
cat > "$HOOKS_DIR/post-commit" << 'HOOK_CONTENT'
#!/bin/bash
# Avika Post-Commit Hook
# Triggers build-stack.sh after each commit (if enabled)

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
CONFIG_FILE="$PROJECT_ROOT/scripts/build.conf"
LOCAL_CONFIG="$PROJECT_ROOT/scripts/build.conf.local"

# Load configuration
AUTO_BUILD_ON_COMMIT="false"
AUTO_BUILD_BUMP_TYPE="patch"

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Local config overrides
if [ -f "$LOCAL_CONFIG" ]; then
    source "$LOCAL_CONFIG"
fi

# Check if auto-build is enabled
if [ "$AUTO_BUILD_ON_COMMIT" != "true" ]; then
    exit 0
fi

echo ""
echo "🔄 Post-commit hook: Auto-build enabled, triggering build..."
echo ""

# Run build with configured bump type
cd "$PROJECT_ROOT"
BUMP="$AUTO_BUILD_BUMP_TYPE" SKIP_GIT_CHECK=1 ./scripts/build-stack.sh

echo ""
echo "✅ Post-commit build completed"
HOOK_CONTENT

chmod +x "$HOOKS_DIR/post-commit"
echo -e "${GREEN}✅ Installed post-commit hook${NC}"

# Create pre-push hook (optional - prevents push if build fails)
cat > "$HOOKS_DIR/pre-push" << 'HOOK_CONTENT'
#!/bin/bash
# Avika Pre-Push Hook
# Validates that VERSION file matches latest tag (optional check)

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
VERSION_FILE="$PROJECT_ROOT/VERSION"

if [ ! -f "$VERSION_FILE" ]; then
    exit 0
fi

CURRENT_VERSION=$(cat "$VERSION_FILE")
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Just informational - doesn't block push
if [ -n "$LATEST_TAG" ] && [ "v$CURRENT_VERSION" != "$LATEST_TAG" ]; then
    echo "ℹ️  Note: VERSION file ($CURRENT_VERSION) differs from latest git tag ($LATEST_TAG)"
fi

exit 0
HOOK_CONTENT

chmod +x "$HOOKS_DIR/pre-push"
echo -e "${GREEN}✅ Installed pre-push hook${NC}"

echo ""
echo -e "${GREEN}✅ Git hooks installed successfully!${NC}"
echo ""
echo "Configuration:"
echo "  - Edit scripts/build.conf to change settings"
echo "  - Create scripts/build.conf.local for local overrides (gitignored)"
echo ""
echo "To enable auto-build on commit:"
echo "  1. Edit scripts/build.conf (or create build.conf.local)"
echo "  2. Set AUTO_BUILD_ON_COMMIT=\"true\""
echo ""
