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

# Check if commit message was provided as argument
if [[ -n "$1" ]]; then
    MESSAGE="$1"
else
    # If no message provided, prompt for one
    echo "${GREEN}Enter commit message:${NC}"
    read MESSAGE
fi

# Check if message is empty
if [[ -z "$MESSAGE" ]]; then
    echo "${YELLOW}Error: Commit message cannot be empty${NC}"
    exit 1
fi

# Add all changes, commit and push
git add .
git commit -m "$MESSAGE"
git push origin $BRANCH

echo "${GREEN}Successfully pushed to ${BRANCH}${NC}"
