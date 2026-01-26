# Backend (MCP Server) Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install runtime utilities needed for healthchecks
RUN apk add --no-cache wget curl ca-certificates

# Configure npm for extended timeouts
RUN npm config set fetch-timeout 120000 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000

# Install pnpm
RUN npm install -g pnpm@10.7.1

# Copy workspace files
COPY pnpm-lock.yaml package.json ./

# Copy root src and config files
COPY tsconfig.json ./

# Install dependencies with extended timeout
RUN pnpm install --config.fetch-timeout=120000

# Copy source code after installing dependencies
COPY src ./src

# Expose port
EXPOSE 4000

# Health check: verify the server is running by checking if port is open
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD netstat -tuln | grep -q 4000 || exit 1

# Start the MCP server with HTTP support
CMD ["sh", "-c", "PORT=4000 pnpm tsx src/index.ts --http"]
