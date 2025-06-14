#!/bin/zsh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if there are any changes to commit
if [[ -z $(git status -s) ]]; then
    echo "${YELLOW}No changes to commit${NC}"
    exit 0
fi

# Show current changes
echo "${GREEN}Current changes:${NC}"
git status -s

# Get commit message
echo "${GREEN}Enter commit message:${NC}"
read MESSAGE

# Add all changes, commit and push
git add .
git commit -m "$MESSAGE"
git push origin $BRANCH

echo "${GREEN}Successfully pushed to ${BRANCH}${NC}"
