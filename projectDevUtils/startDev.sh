#!/bin/bash

# Clean up any existing process on port 3000
echo "🧹 Cleaning up existing processes on port 3000..."
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true

# Wait a moment for cleanup
sleep 1

# Start the development server on port 3000
echo "🚀 Starting development server on port 3000..."
npm run dev
