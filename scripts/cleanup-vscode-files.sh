#!/bin/bash

# Clean up VSCode auto-generated empty files and directories
# This script finds and removes empty files that VSCode extensions create

echo "🧹 Cleaning up VSCode auto-generated empty files..."

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

echo "✅ Cleanup completed"
echo "📊 Removed $((EMPTY_FILES_BEFORE - EMPTY_FILES_AFTER)) empty files"
echo ""
echo "💡 Tips to prevent this issue:"
echo "   • Don't click 'Keep' on file changes in VSCode Source Control"
echo "   • Use 'Discard Changes' instead to avoid creating empty files"  
echo "   • Restart TypeScript language server: Cmd+Shift+P → 'TypeScript: Restart TS Server'"
echo "   • Consider disabling auto-import extensions if they keep creating files"
