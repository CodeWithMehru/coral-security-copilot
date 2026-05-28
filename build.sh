#!/bin/bash

# 1. Install Python tools & Coral Engine
echo "Installing Backend Engine..."
pip install uv
uv sync

# 2. Build the Next.js Frontend
echo "Building Frontend..."
cd frontend
npm install
npm run build