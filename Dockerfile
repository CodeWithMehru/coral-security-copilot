# 1. Solid Linux machine (Node 20 ready)
FROM debian:bookworm-slim

# 2. Saare zaroori tools install karo
RUN apt-get update && apt-get install -y curl python3 python3-pip python3-venv \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 3. 100% Bulletproof way to install uv globally in Docker
RUN pip3 install uv --break-system-packages

# 4. Code copy karo
WORKDIR /app
COPY . .

# 5. Python backend setup karo
RUN uv sync

# 6. Next.js Frontend build karo
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# 7. Add virtual environment to PATH explicitly
ENV PATH="/app/.venv/bin:${PATH}"

ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
