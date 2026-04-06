#!/bin/bash

# Default port, can be overridden via command line argument
PORT=${1:-3000}

# Clean up any existing process on the specified port
echo "🧹 Cleaning up existing processes on port $PORT..."
lsof -ti:$PORT | xargs -r kill -9 2>/dev/null || true

# Wait a moment for cleanup
sleep 1

# Start the development server on the specified port
echo "🚀 Starting development server on port $PORT..."
npm run dev -- --port $PORT
