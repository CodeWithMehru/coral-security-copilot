# 1. Ek solid Linux machine uthao (Debian Bookworm for Node 20)
FROM debian:bookworm-slim

# 2. Saare zaroori tools, Python aur Node.js install karo
RUN apt-get update && apt-get install -y curl python3 python3-pip python3-venv \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 3. System-wide uv install karo
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="/usr/local/bin" sh

# 4. Project ka saara code machine mein daalo
WORKDIR /app
COPY . .

# 5. Python backend engine setup karo
RUN uv sync

# 6. Next.js Frontend build karo
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# 7. THE FIX: Yahan hum Next.js ko Python (venv) aur uv ka exact rasta de rahe hain
ENV PATH="/app/.venv/bin:/usr/local/bin:${PATH}"

# 8. Render ko batao kis port pe chalna hai
ENV PORT=10000
EXPOSE 10000

# 9. Start command
CMD ["npm", "start"]