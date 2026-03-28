FROM golang:1.25-alpine AS builder

ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy the entire repository
COPY . .

# Build the gateway with version info
WORKDIR /app/cmd/gateway
RUN go mod download
RUN CGO_ENABLED=0 go build -ldflags="-s -w \
    -X main.Version=${VERSION} \
    -X main.BuildDate=${BUILD_DATE} \
    -X main.GitCommit=${GIT_COMMIT}" \
    -o gateway .

# Build agent binaries: prefer build-arg VERSION (set by build-stack.sh) so agent never reports 0.1.0-dev
WORKDIR /app
RUN set -e && \
  if [ -n "$VERSION" ] && [ "$VERSION" != "dev" ]; then AGENT_VERSION="$VERSION"; else AGENT_VERSION="$(cat VERSION 2>/dev/null || echo "${VERSION}")"; fi && \
  cd cmd/agent && \
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w \
    -X main.Version=${AGENT_VERSION} \
    -X main.BuildDate=${BUILD_DATE}" \
    -o agent-linux-amd64 . && \
  CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w \
    -X main.Version=${AGENT_VERSION} \
    -X main.BuildDate=${BUILD_DATE}" \
    -o agent-linux-arm64 .

# Generate version.json and checksums (use same version for manifest)
WORKDIR /app
RUN set -e && \
  MANIFEST_VERSION="$(cat VERSION 2>/dev/null || echo "${VERSION}")" && \
  echo "{\"version\":\"${MANIFEST_VERSION}\",\"build_date\":\"${BUILD_DATE}\",\"git_commit\":\"${GIT_COMMIT}\"}" > version.json
RUN sha256sum /app/cmd/agent/agent-linux-amd64 | awk '{print $1}' > /app/cmd/agent/agent-linux-amd64.sha256
RUN sha256sum /app/cmd/agent/agent-linux-arm64 | awk '{print $1}' > /app/cmd/agent/agent-linux-arm64.sha256

# Production stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl

WORKDIR /app
COPY --from=builder /app/cmd/gateway/gateway .
COPY --from=builder /app/VERSION .

# Copy updates directory: version.json at root, binaries only in bin/
# deploy-agent.sh is always served from scripts/ (see gateway updates handler)
RUN mkdir -p /app/updates/bin /app/scripts
COPY --from=builder /app/cmd/agent/agent-linux-amd64 /app/updates/bin/
COPY --from=builder /app/cmd/agent/agent-linux-arm64 /app/updates/bin/
COPY --from=builder /app/cmd/agent/agent-linux-amd64.sha256 /app/updates/bin/
COPY --from=builder /app/cmd/agent/agent-linux-arm64.sha256 /app/updates/bin/
COPY --from=builder /app/version.json /app/updates/
COPY scripts/deploy-agent.sh /app/scripts/
COPY deploy/systemd/avika-agent.service /app/updates/

# Expose ports (5020-5050 range)
EXPOSE 5020 5021 5022

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5021/health || exit 1

CMD ["./gateway"]
