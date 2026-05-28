#!/bin/bash

echo "Installing uv locally inside the project..."
# Ye uv ko .cargo mein nahi, balki isi folder ke andar .uv_bin mein daalega
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$PWD/.uv_bin" sh

# Build time ke liye path
export PATH="$PWD/.uv_bin:$PATH"

echo "Syncing Python backend..."
# Ye .venv folder banayega project ke andar
uv sync

echo "Building Frontend..."
cd frontend
npm install
npm run build