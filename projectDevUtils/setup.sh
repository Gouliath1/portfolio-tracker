#!/bin/bash

# Portfolio Tracker Setup Script for macOS/Linux
# This script sets up the project after downloading from GitHub

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
log_step() {
    echo -e "\n${CYAN}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}   $1${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main setup function
main() {
    echo -e "${CYAN}🚀 Portfolio Tracker Setup Script${NC}"
    echo -e "${CYAN}Platform: $(uname -s) $(uname -m)${NC}"
    echo -e "${CYAN}======================================================${NC}"

    # Step 1: Check prerequisites
    log_step "1. Checking prerequisites"
    
    if command_exists node; then
        NODE_VERSION=$(node --version)
        log_info "Node.js version: $NODE_VERSION"
        
        # Check if Node.js version is >= 18
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | cut -d'v' -f2)
        if [ "$NODE_MAJOR" -lt 18 ]; then
            log_warning "Node.js version 18 or higher is recommended"
        fi
    else
        log_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        log_info "npm version: $NPM_VERSION"
    else
        log_error "npm is not available. Please install npm"
        exit 1
    fi
    
    if command_exists git; then
        GIT_VERSION=$(git --version)
        log_info "$GIT_VERSION"
    else
        log_warning "Git is not installed. You may need it for version control"
    fi
    
    log_success "Prerequisites check completed"

    # Step 2: Install dependencies
    log_step "2. Installing dependencies"
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Make sure you are in the correct directory."
        exit 1
    fi
    
    log_info "Running: npm install"
    if npm install; then
        log_success "Dependencies installed"
    else
        log_error "Failed to install dependencies"
        exit 1
    fi

    # Step 3: Setup environment
    log_step "3. Setting up environment"
    
    if [ ! -f ".env.local" ]; then
        log_info "Creating .env.local file..."
        cat > .env.local << 'EOF'
# Portfolio Tracker Environment Variables
# Add your environment variables here if needed

# Example:
# API_KEY=your_api_key_here
# DATABASE_URL=your_database_url_here
EOF
        log_success ".env.local created"
    else
        log_info ".env.local already exists"
    fi

    # Step 4: Check data files
    log_step "4. Checking data files"
    
    if [ ! -f "src/data/positions.json" ] && [ -f "src/data/positions.template.json" ]; then
        log_info "Creating positions.json from template..."
        cp src/data/positions.template.json src/data/positions.json
        log_success "positions.json created from template"
    elif [ -f "src/data/positions.json" ]; then
        log_info "positions.json already exists"
    fi
    
    # Check other data files
    for file in "dailyPrices.json"; do
        if [ -f "src/data/$file" ]; then
            log_info "$file exists"
        else
            log_info "$file not found"
        fi
    done

    # Step 5: Ask if user wants to build
    log_step "5. Build project (optional)"
    
    read -p "Would you like to build the project now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Running: npm run build"
        if npm run build; then
            log_success "Project built successfully"
        else
            log_error "Build failed. You can try running 'npm run build' manually later."
        fi
    else
        log_warning "Skipping build step. You can run 'npm run build' later."
    fi

    # Completion message
    echo -e "\n${GREEN}============================================================${NC}"
    echo -e "${GREEN}🎉 SETUP COMPLETED SUCCESSFULLY! 🎉${NC}"
    echo -e "${GREEN}============================================================${NC}"
    
    echo -e "\n${CYAN}Next steps:${NC}"
    echo -e "${NC}1. Start the development server:${NC}"
    echo -e "${BLUE}   npm run dev${NC}"
    
    echo -e "\n${NC}2. Open your browser and navigate to:${NC}"
    echo -e "${BLUE}   http://localhost:3000${NC}"
    
    echo -e "\n${NC}3. To customize your portfolio:${NC}"
    echo -e "${BLUE}   - Edit src/data/positions.json with your stock positions${NC}"
    echo -e "${BLUE}   - Update environment variables in .env.local if needed${NC}"
    
    echo -e "\n${CYAN}Useful commands:${NC}"
    echo -e "${BLUE}   npm run dev     - Start development server${NC}"
    echo -e "${BLUE}   npm run build   - Build for production${NC}"
    echo -e "${BLUE}   npm run start   - Start production server${NC}"
    echo -e "${BLUE}   npm run lint    - Run linting${NC}"
    
    echo -e "\n${YELLOW}For more information, check the README.md file.${NC}"
    echo -e "${GREEN}============================================================${NC}"
}

# Run the main function
main "$@"
