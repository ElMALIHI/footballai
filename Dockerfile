# Multi-stage build

# 1. Base stage for installing all dependencies
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ && npm install -g pnpm
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Build stage
FROM base AS build
COPY . .
RUN pnpm run build

# 3. Production stage
FROM node:18-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/healthcheck.js ./src/healthcheck.js

RUN mkdir -p logs models data && chown -R nodejs:nodejs logs models data
USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node src/healthcheck.js

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
