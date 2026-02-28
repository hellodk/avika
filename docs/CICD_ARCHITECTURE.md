# CI/CD Architecture for Avika

## Overview

This document outlines the Continuous Integration and Continuous Deployment (CI/CD) architecture for the Avika project using GitHub Actions, DockerHub, and GitHub Releases.

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Workflow Triggers](#2-workflow-triggers)
3. [Build Artifacts](#3-build-artifacts)
4. [Workflow Architecture](#4-workflow-architecture)
5. [Secrets Management](#5-secrets-management)
6. [Version Strategy](#6-version-strategy)
7. [Multi-Architecture Support](#7-multi-architecture-support)
8. [Workflow Files](#8-workflow-files)
9. [Release Process](#9-release-process)
10. [Cost & Performance Considerations](#10-cost--performance-considerations)

---

## 1. Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GitHub Repository                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PR Created/Updated          Push to master            Tag v1.x.x          │
│         │                          │                        │               │
│         ▼                          ▼                        ▼               │
│   ┌─────────────┐           ┌─────────────┐          ┌─────────────┐       │
│   │  CI Build   │           │  CI Build   │          │   Release   │       │
│   │  (No Push)  │           │  (No Push)  │          │  Workflow   │       │
│   └─────────────┘           └─────────────┘          └──────┬──────┘       │
│         │                          │                        │               │
│         ▼                          ▼                        ▼               │
│   Build & Test              Build & Test            Build, Push, Release    │
│                                                             │               │
└─────────────────────────────────────────────────────────────┼───────────────┘
                                                              │
                    ┌─────────────────────────────────────────┼─────────────────┐
                    │                                         │                 │
                    ▼                                         ▼                 ▼
             ┌─────────────┐                          ┌─────────────┐   ┌─────────────┐
             │  DockerHub  │                          │   GitHub    │   │   GitHub    │
             │   Images    │                          │  Releases   │   │  Packages   │
             └─────────────┘                          └─────────────┘   └─────────────┘
```

## 2. Workflow Triggers

| Event | Workflow | Actions |
|-------|----------|---------|
| Pull Request to `master` | `ci.yml` | Build, Test, Lint (no push) |
| Push to `master` | `ci.yml` | Build, Test, Lint (no push) |
| Tag `v*` | `release.yml` | Build, Push Images, Create Release |
| Manual | `release.yml` | Workflow dispatch with version input |

### Trigger Configuration

```yaml
# CI Workflow (ci.yml)
on:
  pull_request:
    branches: [master, main]
  push:
    branches: [master, main]

# Release Workflow (release.yml)
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., v1.0.0)'
        required: true
```

## 3. Build Artifacts

### Docker Images

| Image | Repository | Tags |
|-------|------------|------|
| Gateway | `hellodk/avika-gateway` | `v1.0.0`, `latest`, `sha-abc1234` |
| Frontend | `hellodk/avika-frontend` | `v1.0.0`, `latest`, `sha-abc1234` |
| Agent | `hellodk/avika-agent` | `v1.0.0`, `latest`, `sha-abc1234` |

### Binary Artifacts

| Binary | Architectures | Format |
|--------|---------------|--------|
| `gateway` | linux/amd64, linux/arm64 | `gateway-linux-amd64`, `gateway-linux-arm64` |
| `agent` | linux/amd64, linux/arm64 | `agent-linux-amd64`, `agent-linux-arm64` |

### Optional Architectures (if needed)

| OS/Arch | Gateway | Agent | Notes |
|---------|---------|-------|-------|
| darwin/amd64 | ✓ | ✓ | macOS Intel |
| darwin/arm64 | ✓ | ✓ | macOS Apple Silicon |
| windows/amd64 | ✓ | ✗ | Agent typically runs on Linux |

## 4. Workflow Architecture

### 4.1 CI Workflow (`ci.yml`)

```
┌─────────────────────────────────────────────────────────────┐
│                       CI Workflow                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │  Lint   │    │  Test   │    │  Build  │    │  Build  │  │
│  │   Go    │    │   Go    │    │ Gateway │    │  Agent  │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│       │              │              │              │        │
│       └──────────────┴──────────────┴──────────────┘        │
│                           │                                 │
│                           ▼                                 │
│                    ┌─────────────┐                          │
│                    │   Build     │                          │
│                    │  Frontend   │                          │
│                    └─────────────┘                          │
│                           │                                 │
│                           ▼                                 │
│                    ┌─────────────┐                          │
│                    │   Docker    │                          │
│                    │ Build Test  │                          │
│                    │ (no push)   │                          │
│                    └─────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Release Workflow (`release.yml`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Release Workflow                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stage 1: Build Binaries (parallel)                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Build Gateway   │  │ Build Gateway   │  │  Build Agent    │             │
│  │ linux/amd64     │  │ linux/arm64     │  │ linux/amd64     │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────┐          │           ┌────────┴────────┐             │
│  │  Build Agent    │          │           │   Upload to     │             │
│  │  linux/arm64    │          │           │   Artifacts     │             │
│  └────────┬────────┘          │           └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┴────────────────────┘                       │
│                                │                                            │
│  Stage 2: Build & Push Docker Images                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Build & Push    │  │ Build & Push    │  │ Build & Push    │             │
│  │ Gateway Image   │  │ Frontend Image  │  │ Agent Image     │             │
│  │ (multi-arch)    │  │ (multi-arch)    │  │ (multi-arch)    │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┴────────────────────┘                       │
│                                │                                            │
│  Stage 3: Create GitHub Release                                             │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  Create Release with:                                        │           │
│  │  - Release notes (from CHANGELOG or auto-generated)          │           │
│  │  - Binary artifacts (gateway-*, agent-*)                     │           │
│  │  - Checksums (SHA256)                                        │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 5. Secrets Management

### Required GitHub Secrets

| Secret | Description | Required For |
|--------|-------------|--------------|
| `DOCKERHUB_USERNAME` | DockerHub username | Image push |
| `DOCKERHUB_TOKEN` | DockerHub access token | Image push |

### Optional Secrets

| Secret | Description | Required For |
|--------|-------------|--------------|
| `GHCR_TOKEN` | GitHub Container Registry | Push to ghcr.io |
| `SIGNING_KEY` | GPG key for signing | Binary signing |

### Setting Up Secrets

1. Go to Repository → Settings → Secrets and variables → Actions
2. Add `DOCKERHUB_USERNAME` with your DockerHub username
3. Add `DOCKERHUB_TOKEN` with a DockerHub access token (not password)

```bash
# Generate DockerHub token at:
# https://hub.docker.com/settings/security → New Access Token
```

## 6. Version Strategy

### Semantic Versioning

```
v<MAJOR>.<MINOR>.<PATCH>[-<prerelease>]

Examples:
  v1.0.0        - Stable release
  v1.1.0        - Minor feature release
  v2.0.0        - Major release (breaking changes)
  v1.0.0-rc.1   - Release candidate
  v1.0.0-beta.1 - Beta release
```

### Version Sources

| Source | Priority | Use Case |
|--------|----------|----------|
| Git tag | 1 (highest) | Release builds |
| VERSION file | 2 | Development builds |
| Git SHA | 3 (fallback) | PR builds |

### Tagging Process

```bash
# Create and push a release tag
git tag -a v1.0.0 -m "Release v1.0.0: Feature description"
git push origin v1.0.0

# This triggers the release workflow
```

## 7. Multi-Architecture Support

### Docker Buildx Configuration

```yaml
# Uses docker/build-push-action with QEMU for cross-compilation
platforms: linux/amd64,linux/arm64
```

### Go Cross-Compilation

```yaml
# Build matrix for Go binaries
strategy:
  matrix:
    include:
      - goos: linux
        goarch: amd64
      - goos: linux
        goarch: arm64
```

### Architecture Detection

| Platform | Docker Platform | Go GOOS/GOARCH |
|----------|-----------------|----------------|
| x86_64 Linux | linux/amd64 | linux/amd64 |
| ARM64 Linux | linux/arm64 | linux/arm64 |
| Raspberry Pi 4 | linux/arm64 | linux/arm64 |
| Apple M1/M2 | linux/arm64 | darwin/arm64 |

## 8. Workflow Files

### Directory Structure

```
.github/
└── workflows/
    ├── ci.yml              # PR and push builds
    ├── release.yml         # Release workflow
    └── cleanup.yml         # (optional) Clean old artifacts
```

### CI Workflow Jobs

| Job | Runs On | Purpose |
|-----|---------|---------|
| `lint` | ubuntu-latest | Go linting with golangci-lint |
| `test` | ubuntu-latest | Go unit tests |
| `build-go` | ubuntu-latest | Build Go binaries (gateway, agent) |
| `build-frontend` | ubuntu-latest | Build Next.js frontend |
| `docker-build` | ubuntu-latest | Test Docker builds (no push) |

### Release Workflow Jobs

| Job | Runs On | Purpose |
|-----|---------|---------|
| `build-binaries` | ubuntu-latest | Cross-compile Go binaries |
| `build-push-images` | ubuntu-latest | Build and push Docker images |
| `create-release` | ubuntu-latest | Create GitHub release with artifacts |

## 9. Release Process

### Automated Release Flow

```
1. Developer creates tag:
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0

2. GitHub Actions triggered:
   - Builds binaries for all architectures
   - Builds Docker images for all architectures
   - Pushes images to DockerHub
   - Creates GitHub Release
   - Uploads binary artifacts
   - Generates checksums

3. Artifacts available:
   - DockerHub: hellodk/avika-gateway:v1.0.0
   - DockerHub: hellodk/avika-frontend:v1.0.0
   - DockerHub: hellodk/avika-agent:v1.0.0
   - GitHub Release: gateway-linux-amd64, gateway-linux-arm64
   - GitHub Release: agent-linux-amd64, agent-linux-arm64
   - GitHub Release: checksums.txt
```

### Manual Release (workflow_dispatch)

```bash
# Trigger via GitHub UI or CLI
gh workflow run release.yml -f version=v1.0.0
```

### Release Checklist

- [ ] All tests passing on master
- [ ] CHANGELOG updated (if maintained)
- [ ] Version bumped in VERSION file
- [ ] Tag created with release notes
- [ ] Verify DockerHub images published
- [ ] Verify GitHub Release created
- [ ] Verify binary checksums

## 10. Cost & Performance Considerations

### GitHub Actions Minutes

| Workflow | Estimated Time | Frequency |
|----------|----------------|-----------|
| CI (PR) | ~5-10 min | Per PR |
| CI (push) | ~5-10 min | Per push to master |
| Release | ~15-20 min | Per release tag |

### Optimization Strategies

1. **Caching**
   - Go modules cache
   - Docker layer cache
   - npm/pnpm cache for frontend

2. **Parallel Jobs**
   - Build binaries in parallel matrix
   - Build Docker images in parallel

3. **Conditional Builds**
   - Skip frontend build if no frontend changes
   - Skip agent build if no agent changes

### Docker Image Sizes (estimated)

| Image | Estimated Size | Base |
|-------|----------------|------|
| Gateway | ~30-50 MB | Alpine/Distroless |
| Frontend | ~100-150 MB | Node Alpine |
| Agent | ~20-40 MB | Alpine/Distroless |

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| **Docker Registry** | DockerHub only |
| **Linux Architectures** | amd64, arm64 |
| **macOS Architectures** | amd64 (Intel), arm64 (Apple Silicon) |
| **Windows** | Not supported |
| **Image Tags** | `v1.0.0`, `latest`, `sha-abc1234` |
| **Release Notes** | Auto-generated with user review |
| **Helm Chart** | Included in releases |
| **Version Source** | VERSION file (auto-bumped) |

## Version Auto-Bump Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Release Trigger                          │
│                                                             │
│  Manual trigger with bump type:                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │  patch  │  │  minor  │  │  major  │                     │
│  │ 1.0.0 → │  │ 1.0.0 → │  │ 1.0.0 → │                     │
│  │ 1.0.1   │  │ 1.1.0   │  │ 2.0.0   │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
│                                                             │
│  Workflow:                                                  │
│  1. Read current version from VERSION file                  │
│  2. Bump version based on type (patch/minor/major)          │
│  3. Update VERSION file                                     │
│  4. Commit version bump                                     │
│  5. Create git tag                                          │
│  6. Build artifacts                                         │
│  7. Push to DockerHub                                       │
│  8. Create GitHub Release (draft for review)                │
│  9. User reviews and publishes                              │
└─────────────────────────────────────────────────────────────┘
```

---

*Last updated: February 2026*
