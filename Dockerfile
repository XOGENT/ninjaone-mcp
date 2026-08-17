# Multi-stage build for efficient container size
FROM node:26-alpine AS builder

# Build arguments
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"
ARG GITHUB_TOKEN

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with GitHub Packages auth.
#
# The token can arrive two ways:
#   1. A BuildKit secret (`--secret id=github_token,env=GITHUB_TOKEN`) — preferred,
#      because the value never lands in the image's layer history. This is what
#      docker-compose.yml uses for local builds.
#   2. The `GITHUB_TOKEN` build arg — required for builders that only support
#      build-time env vars (DigitalOcean App Platform). The arg is only consumed
#      in this non-published builder stage.
# The .npmrc is written and removed inside a single layer either way.
RUN --mount=type=secret,id=github_token \
    TOKEN="$(cat /run/secrets/github_token 2>/dev/null || true)"; \
    [ -n "$TOKEN" ] || TOKEN="${GITHUB_TOKEN}"; \
    printf '@wyre-technology:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$TOKEN" > .npmrc; \
    npm ci --ignore-scripts; status=$?; \
    rm -f .npmrc; \
    exit $status

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:26-alpine AS production

# Create a non-root user for security
RUN addgroup -g 1001 -S ninjaone && \
    adduser -S ninjaone -u 1001 -G ninjaone

# Set working directory
WORKDIR /app

# Copy package files and built application from builder stage
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Prune dev dependencies (avoids re-installing git deps which need build tools)
RUN npm prune --omit=dev && npm cache clean --force

# Create logs directory
RUN mkdir -p /app/logs && chown -R ninjaone:ninjaone /app

# Switch to non-root user
USER ninjaone

# Expose port for HTTP transport
EXPOSE 8080

# Health check against the HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
# Default to env mode for backward compatibility; set to 'gateway' for hosted deployment
ENV AUTH_MODE=env

# Define volume for logs
VOLUME ["/app/logs"]

# Start the application
CMD ["node", "dist/index.js"]

# Build arguments for runtime
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# OCI Labels for metadata
LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="NinjaOne MCP Server - Model Context Protocol server for NinjaOne RMM"
LABEL org.opencontainers.image.title="ninjaone-mcp"
LABEL org.opencontainers.image.description="Model Context Protocol server for NinjaOne RMM integration"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/ninjaone-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/wyre-technology/ninjaone-mcp/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/wyre-technology/ninjaone-mcp/pkgs/container/ninjaone-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/ninjaone-mcp"