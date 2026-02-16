FROM golang:1.24-alpine AS builder

# Build arguments for versioning
ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown

WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with version information embedded
WORKDIR /build/cmd/agent
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s \
    -X 'main.Version=${VERSION}' \
    -X 'main.BuildDate=${BUILD_DATE}' \
    -X 'main.GitCommit=${GIT_COMMIT}' \
    -X 'main.GitBranch=${GIT_BRANCH}'" \
    -o agent .

# Final stage - minimal runtime image
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/cmd/agent/agent .

# Create non-root user
RUN addgroup -g 1000 agent && \
    adduser -D -u 1000 -G agent agent && \
    chown -R agent:agent /app

USER agent

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/app/agent", "-health-check"] || exit 1

# Expose management port
# Application ports (5020-5050 range)
EXPOSE 5025
EXPOSE 5026

# Labels for metadata
LABEL org.opencontainers.image.title="NGINX Manager Agent"
LABEL org.opencontainers.image.description="Agent for NGINX fleet management"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
LABEL org.opencontainers.image.source="https://github.com/yourusername/avika"

CMD ["./agent"]
