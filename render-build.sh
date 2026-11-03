#!/bin/bash
# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..

# Copy frontend build to root dist
mkdir -p dist
cp -r frontend/dist/* dist/
