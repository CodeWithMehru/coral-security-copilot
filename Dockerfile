# 1. Base Linux Machine
FROM debian:bookworm-slim

# 2. Install ALL required OS tools: Python, Node 20, AND 'git'
RUN apt-get update && apt-get install -y curl python3 python3-pip python3-venv git build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 3. Install 'uv' directly into the Linux core path (/usr/bin)
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="/usr/bin" sh

# 4. Copy the whole project
WORKDIR /app
COPY . .

# 5. Build the Python backend
RUN uv sync

# 6. Hard-link the 'coral' binary directly to the system core
RUN ln -s /app/.venv/bin/coral /usr/bin/coral

# 7. Build Next.js
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# 8. Force these variables into the container
ENV CORAL_BIN="/usr/bin/coral"
ENV CORALSEC_ROOT="/app"
ENV CORAL_WORKDIR="/app"
ENV PORT=10000
EXPOSE 10000

# 9. Start Next.js directly
ENV NODE_ENV=production
# THE FIX FOR 502 BAD GATEWAY: Tell Next.js to accept outside internet traffic
ENV HOSTNAME="0.0.0.0" 

CMD ["node", ".next/standalone/server.js"]