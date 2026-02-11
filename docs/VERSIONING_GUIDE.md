# Semantic Versioning & Docker CI/CD Setup

## ✅ What Was Implemented

### 1. **Automated CI/CD Pipeline** (`.github/workflows/agent-build.yml`)

A complete GitHub Actions workflow that:
- ✅ Automatically determines version bumps from commit messages
- ✅ Builds multi-arch Docker images with version metadata
- ✅ Pushes to Docker Hub with multiple tags
- ✅ Creates GitHub releases with changelogs
- ✅ Supports manual version bumps via workflow dispatch

### 2. **Version Embedding in Agent Binary**

The agent now includes full build metadata:
```bash
$ ./agent -version
NGINX Manager Agent
Version:    0.1.0
Build Date: 2026-02-10T13:05:42Z
Git Commit: abc1234
Git Branch: main
```

### 3. **Enhanced Dockerfile** (`cmd/agent/Dockerfile`)

Multi-stage build with:
- ✅ Alpine-based minimal runtime (< 20MB)
- ✅ Non-root user for security
- ✅ Health checks built-in
- ✅ Version metadata as labels
- ✅ Build arguments for version injection

### 4. **Protobuf Extensions**

Added build metadata fields to `AgentInfo`:
- `build_date` - Build timestamp
- `git_commit` - Git commit hash  
- `git_branch` - Git branch name

### 5. **Local Build Script** (`scripts/docker-build.sh`)

Interactive script for local development:
```bash
./scripts/docker-build.sh
```

Features:
- Reads version from `VERSION` file
- Injects git metadata automatically
- Prompts for Docker Hub push
- Color-coded output

## 📋 How to Use

### Setting Up GitHub Secrets

1. Go to your repository → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:
   - `DOCKER_USERNAME`: Your Docker Hub username
   - `DOCKER_PASSWORD`: Your Docker Hub access token (not password!)

### Semantic Versioning Rules

The pipeline automatically bumps versions based on commit messages:

| Commit Message | Version Bump | Example |
|----------------|--------------|---------|
| `fix: bug fix` | **Patch** | 1.0.0 → 1.0.1 |
| `feat: new feature` | **Minor** | 1.0.0 → 1.1.0 |
| `BREAKING CHANGE:` | **Major** | 1.0.0 → 2.0.0 |

### Commit Message Examples

```bash
# Patch bump (0.1.0 → 0.1.1)
git commit -m "fix: resolve config parsing in pods"

# Minor bump (0.1.0 → 0.2.0)
git commit -m "feat: add support for custom metrics collection"

# Major bump (0.1.0 → 1.0.0)
git commit -m "feat: redesign agent API

BREAKING CHANGE: API endpoints have changed structure"
```

### Manual Version Bump

1. Go to **Actions** → **Build and Push Agent**
2. Click **Run workflow**
3. Select version bump type (major/minor/patch)
4. Click **Run workflow**

### Local Development Build

```bash
# Build locally with version info
./scripts/docker-build.sh

# Or manually:
docker build \
  --build-arg VERSION=$(cat VERSION) \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  -t nginx-manager-agent:local \
  -f cmd/agent/Dockerfile .
```

### Deploying to Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-agent
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: agent
        image: yourusername/nginx-manager-agent:1.0.0  # Use specific version
        env:
        - name: GATEWAY_URL
          value: "gateway.nginx-manager.svc.cluster.local:50051"
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
```

## 🏷️ Docker Image Tags

Each build creates multiple tags for flexibility:

- `yourusername/nginx-manager-agent:1.2.3` - Full semver (recommended for production)
- `yourusername/nginx-manager-agent:1.2` - Major.minor
- `yourusername/nginx-manager-agent:1` - Major only
- `yourusername/nginx-manager-agent:latest` - Latest from main branch
- `yourusername/nginx-manager-agent:main-abc1234` - Branch + commit SHA

## 🔒 Security Best Practices

1. **Never commit credentials** - Use GitHub Secrets
2. **Use access tokens** - Not your Docker Hub password
3. **Enable 2FA** on Docker Hub
4. **Pin versions** in production (don't use `latest`)
5. **Scan images** for vulnerabilities (GitHub can do this automatically)

## 📊 Monitoring Builds

- **Build Status**: Check the **Actions** tab
- **GitHub Releases**: Automatically created for main branch builds
- **Build Summary**: Each workflow run shows all generated tags
- **Notifications**: Configure in Settings → Notifications

## 🔄 Workflow Triggers

The pipeline runs on:
- **Push to main/develop** - Auto-build and version bump
- **Pull requests** - Build only (no push)
- **Manual dispatch** - Custom version bump
- **Path filters** - Only when agent code changes

## 📝 Files Created

```
.github/workflows/agent-build.yml  # CI/CD pipeline
VERSION                            # Current version (0.1.0)
cmd/agent/Dockerfile               # Enhanced multi-stage build
scripts/docker-build.sh            # Local build script
docs/DOCKER_CONFIG.md              # Detailed documentation
```

## 🚀 Next Steps

1. **Set up GitHub Secrets** with your Docker Hub credentials
2. **Update VERSION file** to your desired starting version
3. **Push to GitHub** - The pipeline will trigger automatically
4. **Update Kubernetes manifests** to use the new image tags
5. **Configure notifications** for build failures

## 🎯 Benefits

- ✅ **Automated versioning** - No manual version management
- ✅ **Reproducible builds** - Every build is traceable
- ✅ **Security** - Non-root containers, minimal attack surface
- ✅ **Visibility** - Full version info in agent and UI
- ✅ **Flexibility** - Multiple tags for different use cases
- ✅ **Compliance** - Audit trail via GitHub releases

---

**Current Status**: ✅ All components built and ready to use!

Run `./agent -version` to see the version information.
