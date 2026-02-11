# Avika NGINX Agent - Container Deployment

This directory contains the Dockerfile and configuration for running NGINX with the Avika monitoring agent in containers.

## Quick Start

### Automated Build (Recommended)

The `scripts/build-agent.sh` script automatically builds binaries and Docker images with proper version labels:

```bash
# Build with automatic patch version bump
./scripts/build-agent.sh

# Build without version bump
BUMP=none ./scripts/build-agent.sh

# Build with minor version bump
BUMP=minor ./scripts/build-agent.sh
```

**This script automatically:**
- Reads version from `VERSION` file
- Bumps version (if `BUMP` is not `none`)
- Builds agent binaries for amd64 and arm64
- Builds multi-arch Docker image with version labels
- Tags image as both `${VERSION}` and `latest`
- Pushes to Docker registry

**Version labels are automatically injected:**
```dockerfile
LABEL version="${VERSION}"           # e.g., "0.1.18"
LABEL build-date="${BUILD_DATE}"     # e.g., "2026-02-11T03:40:00Z"
LABEL git-commit="${GIT_COMMIT}"     # e.g., "7a9aef8"
LABEL git-branch="${GIT_BRANCH}"     # e.g., "master"
```

### Manual Docker Build

If you need to build manually:

```bash
# Read version from VERSION file
VERSION=$(cat VERSION)
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Build single architecture
docker build -t avika-nginx-agent:${VERSION} \
  --build-arg VERSION="${VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  --build-arg GIT_BRANCH="${GIT_BRANCH}" \
  --build-arg TARGETARCH=amd64 \
  -f nginx-agent/Dockerfile .

# Build multi-architecture (TARGETARCH is set automatically by --platform)
docker buildx build --platform linux/amd64,linux/arm64 \
  --build-arg VERSION="${VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  --build-arg GIT_BRANCH="${GIT_BRANCH}" \
  -t avika-nginx-agent:${VERSION} \
  -t avika-nginx-agent:latest \
  --push .
```

### Docker (Quick Start)

```bash
# Build the image
docker build -t avika-nginx-agent:latest \
  --build-arg TARGETARCH=amd64 \
  -f nginx-agent/Dockerfile .

# Run with environment variables
docker run -d \
  --name nginx-agent \
  -p 80:80 \
  -p 8080:8080 \
  -e GATEWAY_SERVER=192.168.1.10:50051 \
  -e UPDATE_SERVER=http://192.168.1.10:8090 \
  -e AGENT_ID=my-nginx-1 \
  avika-nginx-agent:latest
```

### Kubernetes

```bash
# Update the ConfigMap in deploy/kubernetes/nginx-deployment.yaml
# with your gateway and update server addresses

# Apply the deployment
kubectl apply -f deploy/kubernetes/nginx-deployment.yaml

# Check status
kubectl get pods -l app=nginx
kubectl logs -l app=nginx -f
```

## Environment Variables

All configuration is done via environment variables:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `GATEWAY_SERVER` | `localhost:50051` | Yes | Gateway server address |
| `AGENT_ID` | _(auto-detected)_ | No | Agent identifier (uses POD_NAME or hostname if empty) |
| `HEALTH_PORT` | `8080` | No | Health check endpoint port |
| `UPDATE_SERVER` | _(empty)_ | No | Update server URL for self-updates |
| `UPDATE_INTERVAL` | `168h` | No | How often to check for updates |
| `NGINX_STATUS_URL` | `http://127.0.0.1/nginx_status` | No | NGINX stub_status endpoint |
| `ACCESS_LOG_PATH` | `/var/log/nginx/access.log` | No | NGINX access log path |
| `ERROR_LOG_PATH` | `/var/log/nginx/error.log` | No | NGINX error log path |
| `LOG_FORMAT` | `combined` | No | Log format: `combined` or `json` |
| `BUFFER_DIR` | `/var/lib/avika-agent/` | No | Persistent buffer directory |
| `LOG_LEVEL` | `info` | No | Agent log level: `debug`, `info`, `warn`, `error` |
| `TZ` | `Asia/Kolkata` | No | Timezone |

## Docker Compose Example

```yaml
version: '3.8'

services:
  nginx:
    image: avika-nginx-agent:latest
    ports:
      - "80:80"
      - "8080:8080"
    environment:
      GATEWAY_SERVER: "192.168.1.10:50051"
      UPDATE_SERVER: "http://192.168.1.10:8090"
      AGENT_ID: "nginx-prod-1"
      LOG_FORMAT: "json"
      LOG_LEVEL: "info"
    volumes:
      - nginx-buffer:/var/lib/avika-agent
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

volumes:
  nginx-buffer:
```

## Building Multi-Architecture Images

```bash
# Setup buildx
docker buildx create --name multiarch --use

# Build for multiple architectures
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/avika-nginx-agent:latest \
  --push \
  -f nginx-agent/Dockerfile .
```

## Health Check

The container exposes a health endpoint at `http://localhost:8080/health`.

```bash
# Check health
curl http://localhost:8080/health

# Expected response: 200 OK
```

## Resource Limits

### Docker

```bash
docker run -d \
  --name nginx-agent \
  --cpus=0.5 \
  --memory=512m \
  --memory-reservation=256m \
  -e GATEWAY_SERVER=192.168.1.10:50051 \
  avika-nginx-agent:latest
```

### Kubernetes

Resource limits are defined in the deployment manifest:

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

## Troubleshooting

### View Logs

```bash
# Docker
docker logs -f nginx-agent

# Kubernetes
kubectl logs -f deployment/nginx
```

### Check Agent Connection

```bash
# Docker
docker exec nginx-agent ps aux | grep agent

# Kubernetes
kubectl exec -it deployment/nginx -- ps aux | grep agent
```

### Verify Environment Variables

```bash
# Docker
docker exec nginx-agent env | grep -E 'GATEWAY|UPDATE|AGENT'

# Kubernetes
kubectl exec deployment/nginx -- env | grep -E 'GATEWAY|UPDATE|AGENT'
```

### Agent Not Connecting

1. **Check gateway is reachable:**
   ```bash
   docker exec nginx-agent nc -zv <gateway-ip> 50051
   ```

2. **Verify environment variables:**
   ```bash
   docker exec nginx-agent env | grep GATEWAY_SERVER
   ```

3. **Check agent logs:**
   ```bash
   docker logs nginx-agent 2>&1 | grep -i error
   ```

## Security Notes

- The agent runs as root inside the container (required for NGINX management)
- Container self-updates are supported if `UPDATE_SERVER` is configured
- Use network policies in Kubernetes to restrict agent-gateway communication
- Consider using secrets for sensitive configuration in production

## Persistent Storage

For production deployments, mount a volume for the buffer directory:

```bash
docker run -d \
  -v nginx-buffer:/var/lib/avika-agent \
  -e GATEWAY_SERVER=192.168.1.10:50051 \
  avika-nginx-agent:latest
```

This ensures telemetry data persists across container restarts.
