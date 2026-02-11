# Version Management

This document explains how versions are managed across the Avika NGINX Manager project.

## Version Source of Truth

The **single source of truth** for the version is the `VERSION` file in the project root:

```bash
cat VERSION
# Output: 0.1.18
```

## Automatic Version Injection

### 1. Agent Binaries

When building agent binaries, the version is injected at **compile time** using Go's `-ldflags`:

```bash
# In scripts/build-agent.sh and scripts/release-local.sh
VERSION=$(cat VERSION)
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

go build -ldflags "\
  -X 'main.Version=${VERSION}' \
  -X 'main.BuildDate=${BUILD_DATE}' \
  -X 'main.GitCommit=${GIT_COMMIT}' \
  -X 'main.GitBranch=${GIT_BRANCH}'" \
  -o agent ./cmd/agent
```

The agent can then report its version:

```bash
./agent --version
# Output:
# NGINX Manager Agent
# Version:    0.1.18
# Build Date: 2026-02-11T03:40:00Z
# Git Commit: 7a9aef8
# Git Branch: master
```

### 2. Docker Images

Docker image labels are injected at **build time** using `--build-arg`:

```dockerfile
# In nginx-agent/Dockerfile
ARG VERSION=dev
ARG BUILD_DATE
ARG GIT_COMMIT
ARG GIT_BRANCH

LABEL version="${VERSION}"
LABEL build-date="${BUILD_DATE}"
LABEL git-commit="${GIT_COMMIT}"
LABEL git-branch="${GIT_BRANCH}"
```

The build script passes these arguments:

```bash
# In scripts/build-agent.sh
docker buildx build \
  --build-arg VERSION="${VERSION}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  --build-arg GIT_BRANCH="${GIT_BRANCH}" \
  -t "hellodk/avika-agent:${VERSION}" \
  -t "hellodk/avika-agent:latest" \
  ...
```

Inspect the image labels:

```bash
docker inspect hellodk/avika-agent:latest | jq '.[0].Config.Labels'
# Output:
# {
#   "version": "0.1.18",
#   "build-date": "2026-02-11T03:40:00Z",
#   "git-commit": "7a9aef8",
#   "git-branch": "master",
#   ...
# }
```

## Version Bumping

### Automated Bumping

The build scripts support automatic version bumping:

```bash
# Bump patch version (0.1.18 → 0.1.19)
./scripts/build-agent.sh

# Bump minor version (0.1.18 → 0.2.0)
BUMP=minor ./scripts/build-agent.sh

# Bump major version (0.1.18 → 1.0.0)
BUMP=major ./scripts/build-agent.sh

# Don't bump version
BUMP=none ./scripts/build-agent.sh
```

### Manual Bumping

Edit the `VERSION` file directly:

```bash
echo "0.2.0" > VERSION
```

Then rebuild:

```bash
make build
./scripts/release-local.sh
```

## Version Flow

```
┌─────────────┐
│ VERSION file│  ← Single source of truth
└──────┬──────┘
       │
       ├─────────────────────────────────┐
       │                                 │
       ▼                                 ▼
┌──────────────┐                  ┌──────────────┐
│ Build Script │                  │ Release      │
│ (build-agent)│                  │ (release-    │
│              │                  │  local.sh)   │
└──────┬───────┘                  └──────┬───────┘
       │                                 │
       ├─────────────┬───────────────────┤
       │             │                   │
       ▼             ▼                   ▼
┌──────────┐  ┌─────────────┐    ┌─────────────┐
│ Go Binary│  │Docker Image │    │ version.json│
│ (ldflags)│  │ (build-args)│    │  manifest   │
└──────────┘  └─────────────┘    └─────────────┘
       │             │                   │
       ▼             ▼                   ▼
   --version     docker inspect    Update Server
   0.1.18        labels: 0.1.18    serves manifest
```

## Best Practices

1. **Never hardcode versions** in source files
2. **Always use `VERSION` file** as the source of truth
3. **Use build scripts** to ensure consistency
4. **Tag Docker images** with both version and `latest`
5. **Commit VERSION changes** separately for clear history

## Verification

### Check Binary Version

```bash
./agent --version
./dist/bin/agent-linux-amd64 --version
```

### Check Docker Image Version

```bash
docker inspect hellodk/avika-agent:latest | \
  jq -r '.[0].Config.Labels.version'
```

### Check Update Manifest

```bash
curl http://192.168.1.10:8090/version.json | jq .version
```

### Check Running Agent

```bash
# Via API
curl http://192.168.1.10:3000/api/servers | jq '.[].agent_version'

# Via UI
# Navigate to http://localhost:3000/inventory
# Check "Agent Version" column
```

## Troubleshooting

### Version Mismatch After Build

If the binary shows the wrong version:

1. Check `VERSION` file content
2. Rebuild with `make clean && make build`
3. Verify ldflags in build command

### Docker Image Shows Wrong Version

1. Rebuild with proper build args
2. Clear Docker cache: `docker builder prune`
3. Verify build-args are passed correctly

### Agent Reports Old Version

1. Ensure you're running the newly built binary
2. Check if systemd service is using old binary path
3. Restart the service: `systemctl restart avika-agent`
