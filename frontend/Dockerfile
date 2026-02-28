FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build with production API URL (will be overridden by env vars at runtime)
ENV NEXT_PUBLIC_API_URL=http://avika-gateway:5020
ENV NEXT_PUBLIC_WS_URL=ws://avika-gateway:5021

# Gateway WebSocket URL for browser-side terminal connections
# Must be externally accessible (not internal K8s service name)
ARG NEXT_PUBLIC_GATEWAY_WS_URL
ENV NEXT_PUBLIC_GATEWAY_WS_URL=${NEXT_PUBLIC_GATEWAY_WS_URL}

# Base path for serving under /avika subpath
ARG NEXT_PUBLIC_BASE_PATH=/avika
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

# Enable authentication
ENV AUTH_ENABLED=true

# Version - REQUIRED, no defaults
# Must be passed via: --build-arg VERSION=x.y.z
ARG VERSION
RUN if [ -z "$VERSION" ]; then \
      echo ""; \
      echo "========================================"; \
      echo "ERROR: VERSION build arg is required!"; \
      echo "========================================"; \
      echo ""; \
      echo "Usage:"; \
      echo "  docker build --build-arg VERSION=x.y.z ..."; \
      echo ""; \
      echo "Or use the Makefile:"; \
      echo "  make docker-frontend"; \
      echo ""; \
      exit 1; \
    fi && \
    echo "Building with version: $VERSION" && \
    echo "NEXT_PUBLIC_APP_VERSION=$VERSION" >> .env.production

ENV NEXT_PUBLIC_APP_VERSION=${VERSION}

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir -p .next
RUN chown nextjs:nodejs .next

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy proto file for gRPC client
COPY --from=builder --chown=nextjs:nodejs /app/proto ./proto

USER nextjs

# Use port 5031 to stay within 5020-5050 range
EXPOSE 5031

ENV PORT=5031
ENV HOSTNAME="0.0.0.0"

# Override inherited entrypoint from node image
ENTRYPOINT []
CMD ["node", "server.js"]
