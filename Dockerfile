# Backend (MCP Server) Dockerfile
FROM node:20-alpine

WORKDIR /app

# Configure npm for extended timeouts
RUN npm config set fetch-timeout 120000 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000

# Install pnpm
RUN npm install -g pnpm@10.7.1

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy root src and config files
COPY tsconfig.json ./
COPY src ./src

# Install dependencies with extended timeout
RUN pnpm install --config.fetch-timeout=120000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

# Start the MCP server with HTTP support
CMD ["sh", "-c", "PORT=4000 pnpm tsx src/index.ts --http"]
