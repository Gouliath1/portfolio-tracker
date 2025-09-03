# Portfolio Tracker Scripts

This directory contains scripts for development and deployment automation.

## 🚀 gitPush.sh

A comprehensive script that ensures code quality before committing and pushing to git.

### What it does:

1. **🔨 Build** - Compiles the Next.js project (catches TypeScript errors first)
2. **🧪 Tests** - Runs the complete Jest test suite (53 tests)
3. **🏃 Health Check** - Starts the app briefly to verify it runs
4. **📤 Git Operations** - Commits and pushes changes safely

### Usage:

```bash
# Via VS Code Task (Recommended)
# Use Ctrl+Shift+P → "Tasks: Run Task" → "Safe Commit & Push"

# Or directly via terminal:
./scripts/gitPush.sh "Your commit message"

# Dry run (quality checks without committing):
./scripts/gitPush.sh --dry-run
```

### VS Code Integration:

The script is integrated with VS Code tasks in `.vscode/tasks.json`:

- **Safe Commit & Push** - Full pipeline with commit
- **Full Quality Check** - All checks without committing  
- **Quick Tests** - Tests only
- **Build Project** - Build only
- **Start Development Server** - Launch dev server

### Quality Gates:

- ❌ **Fails if build errors occur** (TypeScript compilation must succeed first)
- ❌ **Fails if tests don't pass** (all 53 tests must succeed)
- ⚠️ **Warns if app health check fails** (but continues)
- ❌ **Fails if git operations fail**

### Features:

- 🎨 **Colored output** for easy reading
- 🔍 **Dry run mode** for testing
- 📊 **Progress tracking** with clear steps
- 🛡️ **Error handling** with proper exit codes
- 📝 **Detailed summary** of operations

## Other Scripts:

- **setup.sh** - Development environment setup (Unix/macOS)
- **setup.js** - Development environment setup (Cross-platform)
- **setup.bat** - Development environment setup (Windows)
- **startDev.sh** - Quick development server launcher

## Best Practices:

1. Always use the **Safe Commit & Push** task for important changes
2. Run **Full Quality Check** during development to catch issues early
3. Keep commit messages descriptive and clear
4. Let the script handle all quality validations automatically

---

💡 **Tip**: Set up the Cline workspace instructions to automatically reference these tasks for a smooth development workflow!
