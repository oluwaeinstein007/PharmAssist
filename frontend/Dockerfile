# Frontend build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.7.1

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies with extended timeout for network issues
RUN pnpm install \
    --config.fetch-timeout=300000 \
    --config.fetch-retries=5 \
    --frozen-lockfile

# Copy source code
COPY . .

# Build the Next.js application (NOT dev!)
RUN pnpm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.7.1

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install \
    --config.fetch-timeout=300000 \
    --config.fetch-retries=5 \
    --prod \
    --frozen-lockfile

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy next.config.js and other necessary config files
COPY --from=builder /app/next.config.* ./

# Set to production
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]