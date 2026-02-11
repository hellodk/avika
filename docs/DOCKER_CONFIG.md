# Docker Configuration for NGINX Manager

## Docker Hub Credentials

Store your Docker Hub credentials as GitHub Secrets:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `DOCKER_USERNAME`: Your Docker Hub username
   - `DOCKER_PASSWORD`: Your Docker Hub password or access token

## Local Docker Build

For local development and testing:

```bash
# Build with version info
docker build \
  --build-arg VERSION=$(cat VERSION) \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  -t nginx-manager-agent:local \
  -f cmd/agent/Dockerfile .

# Run locally
docker run -d \
  --name nginx-agent \
  -e GATEWAY_URL=host.docker.internal:50051 \
  nginx-manager-agent:local
```

## Manual Docker Push

```bash
# Login to Docker Hub
docker login

# Tag image
docker tag nginx-manager-agent:local yourusername/nginx-manager-agent:$(cat VERSION)

# Push
docker push yourusername/nginx-manager-agent:$(cat VERSION)
docker push yourusername/nginx-manager-agent:latest
```

## Semantic Versioning

The CI/CD pipeline automatically determines version bumps based on commit messages:

- **BREAKING CHANGE**: Major version bump (1.0.0 → 2.0.0)
- **feat:**: Minor version bump (1.0.0 → 1.1.0)
- **fix:**, **chore:**, etc.: Patch version bump (1.0.0 → 1.0.1)

### Commit Message Examples

```bash
# Patch bump (0.1.0 → 0.1.1)
git commit -m "fix: resolve config parsing issue"

# Minor bump (0.1.0 → 0.2.0)
git commit -m "feat: add support for custom metrics"

# Major bump (0.1.0 → 1.0.0)
git commit -m "feat: redesign API

BREAKING CHANGE: API endpoints have changed"
```

## Manual Version Bump

Trigger a manual build with specific version bump:

1. Go to Actions → Build and Push Agent
2. Click "Run workflow"
3. Select bump type (major/minor/patch)
4. Click "Run workflow"

## Docker Image Tags

Each build creates multiple tags:

- `yourusername/nginx-manager-agent:1.2.3` (full semver)
- `yourusername/nginx-manager-agent:1.2` (major.minor)
- `yourusername/nginx-manager-agent:1` (major)
- `yourusername/nginx-manager-agent:latest` (main branch only)
- `yourusername/nginx-manager-agent:main-abc1234` (branch + commit)

## Security Best Practices

1. **Never commit credentials** to the repository
2. Use **GitHub Secrets** for sensitive data
3. Use **Docker Hub Access Tokens** instead of passwords
4. Enable **2FA** on Docker Hub
5. Regularly **rotate access tokens**

## Alternative Registries

### GitHub Container Registry (ghcr.io)

Update `.github/workflows/agent-build.yml`:

```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/agent
```

Login step:
```yaml
- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

### AWS ECR

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1

- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2
```

## Monitoring Builds

- View build status in the **Actions** tab
- Each build creates a **GitHub Release** with changelog
- Build summary shows all generated tags
- Failed builds send notifications (configure in Settings → Notifications)
