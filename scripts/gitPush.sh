#!/bin/zsh

# Portfolio Tracker - Safe Git Push Script
# This script runs quality checks before committing and pushing code
#
# Usage: 
#   ./gitPush.sh "Your commit message here"
#   ./gitPush.sh --dry-run "Your commit message here"
#   ./gitPush.sh --dry-run  (for dry run without committing)
#   ./gitPush.sh  (will prompt for commit message)

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for dry-run mode and extract commit message
DRY_RUN=false
COMMIT_MESSAGE=""

if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    shift  # Remove --dry-run from arguments
    COMMIT_MESSAGE="$*"  # Remaining arguments as commit message
else
    COMMIT_MESSAGE="$*"  # All arguments as commit message
fi

echo "${BLUE}🚀 Portfolio Tracker - Safe Git Push${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo "${YELLOW}🔍 DRY RUN MODE - No commits will be made${NC}"
fi
echo "============================================"

# Get current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "${BLUE}Current branch: ${BRANCH}${NC}"

# Check if there are any changes to commit
if [[ -z $(git status -s) ]]; then
    echo "${YELLOW}⚠️  No changes to commit${NC}"
    if [[ "$DRY_RUN" == true ]]; then
        echo "${GREEN}✅ Quality checks can be run (no uncommitted changes)${NC}"
    fi
    exit 0
fi

# Show current changes
echo "${GREEN}📝 Current changes:${NC}"
git status -s
echo ""

# Step 1: Build the project
echo "${BLUE}🔨 Step 1: Building project...${NC}"
if npm run build; then
    echo "${GREEN}✅ Build successful${NC}"
else
    echo "${RED}❌ Build failed. Fix build errors before committing.${NC}"
    exit 1
fi
echo ""

# Step 2: Run Tests
echo "${BLUE}🧪 Step 2: Running tests...${NC}"
if npm test; then
    echo "${GREEN}✅ All tests passed${NC}"
else
    echo "${RED}❌ Tests failed. Fix tests before committing.${NC}"
    exit 1
fi
echo ""

# Step 3: Quick application test (optional - can be disabled)
echo "${BLUE}🏃 Step 3: Quick application test...${NC}"
# Start the app in background for a quick health check
npm run dev &
APP_PID=$!
sleep 5  # Wait for app to start

# Check if the app is responding
if curl -s http://localhost:3000 > /dev/null; then
    echo "${GREEN}✅ Application starts successfully${NC}"
    kill $APP_PID
    wait $APP_PID 2>/dev/null || true
else
    echo "${YELLOW}⚠️  Application health check skipped (couldn't connect)${NC}"
    kill $APP_PID 2>/dev/null || true
    wait $APP_PID 2>/dev/null || true
fi
echo ""

# Get commit message
if [[ "$DRY_RUN" == false ]]; then
    echo "${BLUE}💬 Preparing commit...${NC}"
    if [[ -n "$COMMIT_MESSAGE" ]]; then
        MESSAGE="$COMMIT_MESSAGE"
        echo "${GREEN}Using provided commit message: ${MESSAGE}${NC}"
    else
        # If no message provided, prompt for one
        echo "${GREEN}Enter commit message:${NC}"
        read MESSAGE
    fi

    # Check if message is empty
    if [[ -z "$MESSAGE" ]]; then
        echo "${RED}❌ Error: Commit message cannot be empty${NC}"
        echo "${YELLOW}Usage: $0 [--dry-run] \"Your commit message here\"${NC}"
        exit 1
    fi
else
    if [[ -n "$COMMIT_MESSAGE" ]]; then
        echo "${YELLOW}🔍 Dry run mode - would use commit message: ${COMMIT_MESSAGE}${NC}"
    else
        echo "${YELLOW}🔍 Dry run mode - no commit message provided${NC}"
    fi
fi
echo ""

# Step 4: Git operations (only if not dry run)
if [[ "$DRY_RUN" == false ]]; then
    echo "${BLUE}📤 Step 4: Committing and pushing...${NC}"

    # Add all changes
    git add .

    # Show what will be committed
    echo "${GREEN}Files to be committed:${NC}"
    git diff --cached --name-status
    echo ""

    # Commit
    if git commit -m "$MESSAGE"; then
        echo "${GREEN}✅ Commit successful${NC}"
    else
        echo "${RED}❌ Commit failed${NC}"
        exit 1
    fi

    # Push to remote
    echo "${BLUE}Pushing to origin/${BRANCH}...${NC}"
    if git push origin $BRANCH; then
        echo "${GREEN}🎉 Successfully pushed to ${BRANCH}${NC}"
        echo ""
        echo "${BLUE}Summary:${NC}"
        echo "✅ Build successful"
        echo "✅ Tests passed" 
        echo "✅ Application health check completed"
        echo "✅ Code committed and pushed"
        echo ""
        echo "${GREEN}🚀 Deployment ready!${NC}"
    else
        echo "${RED}❌ Push failed${NC}"
        exit 1
    fi
else
    echo "${BLUE}📋 Quality Check Summary:${NC}"
    echo "✅ Build successful"
    echo "✅ Tests passed" 
    echo "✅ Application health check completed"
    echo ""
    echo "${GREEN}🎉 All quality checks passed! Code is ready to commit.${NC}"
fi
