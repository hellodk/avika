#!/bin/bash
# Safe push script with security checks and confirmation
# Usage: ./scripts/safe-push.sh [commit-message]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Safe Push to GitHub - Security Checks             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# 1. Check if we're in a git repository
# ============================================================================
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}✗ Not a git repository${NC}"
    exit 1
fi

# ============================================================================
# 2. Check for uncommitted changes
# ============================================================================
echo -e "${BLUE}📋 Checking repository status...${NC}"

if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠ You have uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    
    # Get commit message
    if [ -z "$1" ]; then
        echo -e "${CYAN}Enter commit message:${NC}"
        read -r COMMIT_MSG
    else
        COMMIT_MSG="$1"
    fi
    
    if [ -z "$COMMIT_MSG" ]; then
        echo -e "${RED}✗ Commit message cannot be empty${NC}"
        exit 1
    fi
    
    # Stage all changes
    echo -e "${BLUE}📦 Staging changes...${NC}"
    git add .
    
    # Commit (this will trigger pre-commit hook)
    echo -e "${BLUE}💾 Committing changes...${NC}"
    if ! git commit -m "$COMMIT_MSG"; then
        echo -e "${RED}✗ Commit failed (security checks may have blocked it)${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Changes committed${NC}"
else
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
fi

# ============================================================================
# 3. Additional security scan
# ============================================================================
echo ""
echo -e "${BLUE}🔍 Running additional security scans...${NC}"

# Check for .env files in git
if git ls-files | grep -q "\.env$"; then
    echo -e "${RED}✗ .env file is tracked in git!${NC}"
    echo -e "${YELLOW}  Run: git rm --cached .env${NC}"
    exit 1
fi

# Check for common secret file patterns
SECRET_PATTERNS=("*.pem" "*.key" "id_rsa" "credentials.json")
for pattern in "${SECRET_PATTERNS[@]}"; do
    if git ls-files | grep -q "$pattern"; then
        echo -e "${RED}✗ Sensitive file pattern found in git: $pattern${NC}"
        echo -e "${YELLOW}  Review and remove if necessary${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ Security scans passed${NC}"

# ============================================================================
# 4. Show what will be pushed
# ============================================================================
echo ""
echo -e "${BLUE}📤 Preparing to push...${NC}"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${CYAN}Current branch: ${CURRENT_BRANCH}${NC}"

# Check if remote exists
if ! git remote | grep -q "origin"; then
    echo -e "${RED}✗ No 'origin' remote configured${NC}"
    echo -e "${YELLOW}Configure with: git remote add origin <url>${NC}"
    exit 1
fi

# Get remote URL
REMOTE_URL=$(git remote get-url origin)
echo -e "${CYAN}Remote: ${REMOTE_URL}${NC}"

# Count commits ahead
COMMITS_AHEAD=$(git rev-list --count origin/${CURRENT_BRANCH}..HEAD 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD" = "0" ]; then
    echo -e "${GREEN}✓ Already up to date with remote${NC}"
    exit 0
fi

echo -e "${CYAN}Commits to push: ${COMMITS_AHEAD}${NC}"
echo ""

# Show commits that will be pushed
echo -e "${BLUE}Commits to be pushed:${NC}"
git log origin/${CURRENT_BRANCH}..HEAD --oneline --decorate
echo ""

# ============================================================================
# 5. Confirmation
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠  You are about to push ${COMMITS_AHEAD} commit(s) to GitHub${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
read -p "Do you want to continue? (yes/no): " -r CONFIRM

if [[ ! $CONFIRM =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${YELLOW}✗ Push cancelled${NC}"
    exit 0
fi

# ============================================================================
# 6. Push to GitHub
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Pushing to GitHub...${NC}"

if git push origin "$CURRENT_BRANCH"; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Successfully pushed to GitHub!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}Branch: ${CURRENT_BRANCH}${NC}"
    echo -e "${CYAN}Remote: ${REMOTE_URL}${NC}"
    echo -e "${CYAN}Commits pushed: ${COMMITS_AHEAD}${NC}"
    echo ""
    
    # Check if CI/CD will trigger
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "develop" ]; then
        echo -e "${BLUE}ℹ  CI/CD pipeline will trigger automatically${NC}"
        echo -e "${BLUE}   Check progress at: GitHub → Actions tab${NC}"
    fi
    
    echo ""
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ Push failed${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo "  • Check your internet connection"
    echo "  • Verify GitHub credentials"
    echo "  • Pull latest changes: git pull origin $CURRENT_BRANCH"
    echo "  • Check branch permissions on GitHub"
    echo ""
    exit 1
fi
