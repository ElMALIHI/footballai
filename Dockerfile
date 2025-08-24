# Multi-stage build

# 1. Base stage for installing all dependencies
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ && npm install -g pnpm

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies (will generate lock file if missing)
RUN pnpm install

# 2. Build stage
FROM base AS build
# Copy source code
COPY . .

# 3. Production stage
FROM node:18-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init curl netcat-openbsd
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Create required directories for AI training and model storage
RUN mkdir -p /app/data/training /app/models /app/logs
# - /app/data/training: AI training data storage
# - /app/models: Trained AI models storage  
# - /app/logs: Application logs

# Create directories with proper ownership before switching user
RUN chown -R nodejs:nodejs /app

# Copy dependencies and source
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/healthcheck.js ./src/healthcheck.js
COPY --from=build /app/scripts/start.sh ./scripts/start.sh

# Declare volumes for persistent data
VOLUME ["/app/data", "/app/models", "/app/logs"]

# Set script permissions
RUN chmod +x ./scripts/start.sh

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node src/healthcheck.js

ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/start.sh"]
