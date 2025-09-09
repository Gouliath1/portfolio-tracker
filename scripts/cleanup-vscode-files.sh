#!/bin/bash

# Clean up VSCode auto-generated empty files and directories
# This script finds and removes empty files that VSCode extensions create
# Can be run from any directory - will always operate on the solution root

# Determine the solution root directory (parent of the scripts folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOLUTION_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧹 Cleaning up VSCode auto-generated empty files..."
echo "📂 Solution root: $SOLUTION_ROOT"

# Change to solution root directory
cd "$SOLUTION_ROOT" || {
    echo "❌ Error: Could not change to solution root directory: $SOLUTION_ROOT"
    exit 1
}

# Count files before cleanup
EMPTY_FILES_BEFORE=$(find . -name "*.ts" -size 0 -o -name "*.tsx" -size 0 -o -name "*.js" -size 0 -o -name "*.jsx" -size 0 | grep -v node_modules | wc -l | xargs)
echo "📊 Found $EMPTY_FILES_BEFORE empty files before cleanup"

# Remove all empty TypeScript, JavaScript, and JSX files (excluding node_modules)
echo "🗑️  Removing empty TypeScript and JavaScript files..."
find . -name "*.ts" -size 0 -not -path "./node_modules/*" -delete
find . -name "*.tsx" -size 0 -not -path "./node_modules/*" -delete
find . -name "*.js" -size 0 -not -path "./node_modules/*" -delete
find . -name "*.jsx" -size 0 -not -path "./node_modules/*" -delete

# Remove empty JSON files in wrong locations (but preserve data/positions.json)
echo "🗑️  Removing misplaced empty JSON files..."
find ./src -name "*.json" -size 0 -delete 2>/dev/null || true

# Remove empty directories that only contained auto-generated files
echo "🗑️  Removing empty directories..."
find . -type d -empty -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./.next/*" -delete 2>/dev/null || true

# Count files after cleanup
EMPTY_FILES_AFTER=$(find . -name "*.ts" -size 0 -o -name "*.tsx" -size 0 -o -name "*.js" -size 0 -o -name "*.jsx" -size 0 | grep -v node_modules | wc -l | xargs)

echo "✅ Cleanup completed in: $(pwd)"
echo "📊 Removed $((EMPTY_FILES_BEFORE - EMPTY_FILES_AFTER)) empty files"
echo ""
echo "💡 Tips to prevent this issue:"
echo "   • Avoid clicking 'Keep' on unwanted file changes in VSCode Source Control"
echo "   • Check VSCode settings: disable automatic file creation in TypeScript extensions"
echo "   • Review .vscode/settings.json for typescript.suggest.autoImports: false"
echo "   • Consider running this cleanup script regularly to maintain a clean workspace"
