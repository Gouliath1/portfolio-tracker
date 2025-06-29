@echo off
REM Portfolio Tracker Setup Script for Windows
REM This script sets up the project after downloading from GitHub

setlocal enabledelayedexpansion

echo 🚀 Portfolio Tracker Setup Script
echo Platform: Windows
echo ======================================================

REM Step 1: Check prerequisites
echo.
echo 1. Checking prerequisites

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    Node.js version: %NODE_VERSION%

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not available. Please install npm
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo    npm version: %NPM_VERSION%

REM Check Git (optional)
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Git is not installed. You may need it for version control
) else (
    for /f "tokens=*" %%i in ('git --version') do set GIT_VERSION=%%i
    echo    !GIT_VERSION!
)

echo ✅ Prerequisites check completed

REM Step 2: Install dependencies
echo.
echo 2. Installing dependencies

if not exist "package.json" (
    echo ❌ package.json not found. Make sure you are in the correct directory.
    pause
    exit /b 1
)

echo    Running: npm install
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed

REM Step 3: Setup environment
echo.
echo 3. Setting up environment

if not exist ".env.local" (
    echo    Creating .env.local file...
    (
        echo # Portfolio Tracker Environment Variables
        echo # Add your environment variables here if needed
        echo.
        echo # Example:
        echo # API_KEY=your_api_key_here
        echo # DATABASE_URL=your_database_url_here
    ) > .env.local
    echo ✅ .env.local created
) else (
    echo    .env.local already exists
)

REM Step 4: Check data files
echo.
echo 4. Checking data files

if not exist "src\data\positions.json" (
    if exist "src\data\positions.template.json" (
        echo    Creating positions.json from template...
        copy "src\data\positions.template.json" "src\data\positions.json" >nul
        echo ✅ positions.json created from template
    )
) else (
    echo    positions.json already exists
)

REM Check other data files
for %%f in (positionsPrices.json) do (
    if exist "src\data\%%f" (
        echo    %%f exists
    ) else (
        echo    %%f not found
    )
)

REM Step 5: Ask if user wants to build
echo.
echo 5. Build project (optional)

set /p BUILD_CHOICE="Would you like to build the project now? (y/N): "
if /i "%BUILD_CHOICE%"=="y" (
    echo    Running: npm run build
    call npm run build
    if %errorlevel% neq 0 (
        echo ❌ Build failed. You can try running 'npm run build' manually later.
    ) else (
        echo ✅ Project built successfully
    )
) else (
    echo ⚠️  Skipping build step. You can run 'npm run build' later.
)

REM Completion message
echo.
echo ============================================================
echo 🎉 SETUP COMPLETED SUCCESSFULLY! 🎉
echo ============================================================
echo.
echo Next steps:
echo 1. Start the development server:
echo    npm run dev
echo.
echo 2. Open your browser and navigate to:
echo    http://localhost:3000
echo.
echo 3. To customize your portfolio:
echo    - Edit src\data\positions.json with your stock positions
echo    - Update environment variables in .env.local if needed
echo.
echo Useful commands:
echo    npm run dev     - Start development server
echo    npm run build   - Build for production
echo    npm run start   - Start production server
echo    npm run lint    - Run linting
echo.
echo For more information, check the README.md file.
echo ============================================================

pause
