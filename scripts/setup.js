#!/usr/bin/env node

/**
 * Cross-platform setup script for Portfolio Tracker
 * Works on Windows, macOS, and Linux
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n${step}. ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function execCommand(command, description) {
    try {
        log(`   Running: ${command}`, 'blue');
        const output = execSync(command, { 
            stdio: 'inherit',
            cwd: process.cwd()
        });
        logSuccess(description);
        return true;
    } catch (error) {
        logError(`Failed: ${description}`);
        logError(`Error: ${error.message}`);
        return false;
    }
}

function checkPrerequisites() {
    logStep(1, 'Checking prerequisites');
    
    // Check Node.js
    try {
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        log(`   Node.js version: ${nodeVersion}`, 'green');
        
        const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
        if (majorVersion < 18) {
            logWarning('Node.js version 18 or higher is recommended');
        }
    } catch (error) {
        logError('Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/');
        process.exit(1);
    }
    
    // Check npm
    try {
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        log(`   npm version: ${npmVersion}`, 'green');
    } catch (error) {
        logError('npm is not available. Please install npm');
        process.exit(1);
    }
    
    // Check Git
    try {
        const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
        log(`   ${gitVersion}`, 'green');
    } catch (error) {
        logWarning('Git is not installed. You may need it for version control');
    }
    
    logSuccess('Prerequisites check completed');
}

function installDependencies() {
    logStep(2, 'Installing dependencies');
    
    if (!fs.existsSync('package.json')) {
        logError('package.json not found. Make sure you are in the correct directory.');
        process.exit(1);
    }
    
    return execCommand('npm install', 'Dependencies installed');
}

function setupEnvironment() {
    logStep(3, 'Setting up environment');
    
    // Check if .env.local exists
    if (!fs.existsSync('.env.local')) {
        log('   Creating .env.local file...', 'blue');
        const envContent = `# Portfolio Tracker Environment Variables
# Add your environment variables here if needed

# Example:
# API_KEY=your_api_key_here
# DATABASE_URL=your_database_url_here
`;
        fs.writeFileSync('.env.local', envContent);
        logSuccess('.env.local created');
    } else {
        log('   .env.local already exists', 'green');
    }
    
    return true;
}

function checkDataFiles() {
    logStep(4, 'Checking data files');
    
    const dataDir = 'src/data';
    
    // Check if positions.json exists, if not copy from template
    const positionsFile = path.join(dataDir, 'positions.json');
    const positionsTemplate = path.join(dataDir, 'positions.template.json');
    
    if (!fs.existsSync(positionsFile) && fs.existsSync(positionsTemplate)) {
        log('   Creating positions.json from template...', 'blue');
        fs.copyFileSync(positionsTemplate, positionsFile);
        logSuccess('positions.json created from template');
    } else if (fs.existsSync(positionsFile)) {
        log('   positions.json already exists', 'green');
    }
    
    // Check other data files
    const requiredDataFiles = [
        'positionsPrices.json'
    ];
    
    requiredDataFiles.forEach(file => {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            log(`   ${file} exists`, 'green');
        } else {
            log(`   ${file} not found`, 'yellow');
        }
    });
    
    return true;
}

function buildProject() {
    logStep(5, 'Building the project with tests');
    log('   Note: Build process includes running tests automatically', 'blue');
    
    return execCommand('npm run build', 'Project built successfully (tests passed)');
}

function showCompletionMessage(buildSuccess = true) {
    log('\n' + '='.repeat(60), 'green');
    if (buildSuccess) {
        log('🎉 SETUP COMPLETED SUCCESSFULLY! 🎉', 'green');
    } else {
        log('⚠️  SETUP COMPLETED WITH ISSUES ⚠️', 'yellow');
        log('Dependencies installed but build failed.', 'yellow');
    }
    log('='.repeat(60), 'green');
    
    log('\nNext steps:', 'cyan');
    log('1. Start the development server:', 'white');
    log('   npm run dev', 'blue');
    
    log('\n2. Open your browser and navigate to:', 'white');
    log('   http://localhost:3000', 'blue');
    
    log('\n3. To customize your portfolio:', 'white');
    log('   - Edit src/data/positions.json with your stock positions', 'blue');
    log('   - Update environment variables in .env.local if needed', 'blue');
    
    log('\nUseful commands:', 'cyan');
    log('   npm run dev         - Start development server', 'blue');
    log('   npm run build       - Build for production (includes tests)', 'blue');
    log('   npm run start       - Start production server', 'blue');
    log('   npm run lint        - Run linting', 'blue');
    log('   npm test            - Run unit tests', 'blue');
    log('   npm run test:watch  - Run tests in watch mode', 'blue');
    log('   npm run test:coverage - Run tests with coverage', 'blue');
    
    log('\nFor more information, check the README.md file.', 'yellow');
    log('\n' + '='.repeat(60), 'green');
}

function main() {
    log('🚀 Portfolio Tracker Setup Script', 'magenta');
    log(`Platform: ${os.platform()} ${os.arch()}`, 'cyan');
    log(`Node.js: ${process.version}`, 'cyan');
    log('='.repeat(60), 'cyan');
    
    try {
        // Run setup steps
        checkPrerequisites();
        
        if (!installDependencies()) {
            process.exit(1);
        }
        
        setupEnvironment();
        checkDataFiles();
        
        // Ask user if they want to build the project
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('\nWould you like to build the project now? This will run tests first. (y/N): ', (answer) => {
            rl.close();
            
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                if (buildProject()) {
                    showCompletionMessage(true);
                } else {
                    logError('Build failed. This could be due to failing tests or compilation errors.');
                    log('You can try running "npm test" to check tests, or "npm run build" manually later.', 'blue');
                    showCompletionMessage(false);
                }
            } else {
                log('\nSkipping build step. You can run "npm run build" later.', 'yellow');
                log('Note: The build process now includes running tests automatically.', 'blue');
                showCompletionMessage(true);
            }
        });
        
    } catch (error) {
        logError(`Setup failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the setup
if (require.main === module) {
    main();
}

module.exports = { main };
