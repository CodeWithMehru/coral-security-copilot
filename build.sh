#!/bin/bash

# 1. Install 'uv' using the official standalone installer
echo "Installing Backend Engine..."
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Add it to the system path immediately so the build can use it
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# 3. Sync Python dependencies
echo "Syncing Python backend..."
uv sync

# 4. Build Next.js
echo "Building Frontend..."
cd frontend
npm install
npm run build