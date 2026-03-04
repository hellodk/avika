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
│   PR to master/main              Push to master/main                         │
│         │                                      │                             │
│         ▼                                      ▼                             │
│   ┌─────────────┐  ┌─────────────┐     ┌─────────────┐  ┌─────────────┐     │
│   │  CI (no     │  │ Build on PR │     │  CI (no     │  │ Build on    │     │
│   │  push)      │  │ pr-*, sha-* │     │  push)      │  │ Merge       │     │
│   └─────────────┘  └──────┬──────┘     └─────────────┘  │ latest,sha  │     │
│                           │                             └──────┬──────┘     │
│                           │                                      │          │
│                           │              ┌─────────────┐          │          │
│                           │              │  Release   │          │          │
│                           │              │ (if feat/  │          │          │
│                           │              │  fix/merge)│          │          │
│                           │              └──────┬──────┘          │          │
└───────────────────────────┼─────────────────────┼────────────────┼─────────┘
                             │                     │                │
                    ┌────────┴────────┐             │                │
                    ▼                 ▼             ▼                ▼
             ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   DockerHub
             │  DockerHub  │   │   GitHub    │   │  Releases   │   (versioned +
             │  pr-*, sha  │   │  (no pkg)   │   │  binaries   │   latest, sha)
             └─────────────┘   └─────────────┘   └─────────────┘
```

## 2. Workflow Triggers

| Event | Workflow | Actions |
|-------|----------|---------|
| Pull Request to `master`/`main` | `ci.yml` | Lint, Test, Docker build test (no push) |
| Pull Request to `master`/`main` | `build-on-pr.yml` | Build and push images with tags `pr-<n>`, `sha-<sha>` |
| Push to `master`/`main` | `ci.yml` | Lint, Test, Docker build test (no push) |
| Push to `master`/`main` | `build-on-merge.yml` | Build and push images with tags `latest`, `sha-<sha>` |
| Push to `master`/`main` (releasable commits) | `release.yml` | Analyze commits; if feat/fix/merge: version bump, push versioned images, GitHub Release |
| Manual | `release.yml` | Workflow dispatch with bump type (auto/patch/minor/major) |

### Trigger Configuration

```yaml
# CI (ci.yml)
on:
  pull_request:
    branches: [master, main]
  push:
    branches: [master, main, 'feat/*']

# Build on Merge (build-on-merge.yml) - ensures images always built on merge
on:
  push:
    branches: [master, main]

# Build on PR (build-on-pr.yml) - QA images for pull requests
on:
  pull_request:
    branches: [master, main]

# Release (release.yml) - version bump and release when commits are releasable
on:
  push:
    branches: [master, main]
  workflow_dispatch:
    inputs:
      bump_type: [auto, patch, minor, major]
      prerelease: ''
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
| `DOCKERHUB_TOKEN` | DockerHub access token (not password) | Image push (all workflows that push) |
| `DOCKERHUB_USERNAME` | Optional; workflows default to `hellodk` in env | Override image namespace |

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
    ├── ci.yml                # Lint, test, Docker build test (no push)
    ├── build-on-merge.yml     # Build and push on push to master/main (latest, sha-*)
    ├── build-on-pr.yml       # Build and push on PR (pr-*, sha-*)
    └── release.yml           # Version bump, versioned images, GitHub Release
```

### CI Workflow Jobs (`ci.yml`)

| Job | Runs On | Purpose |
|-----|---------|---------|
| `lint` | ubuntu-latest | Go linting with golangci-lint |
| `test` | ubuntu-latest | Go unit tests |
| `build-gateway` | ubuntu-latest | Build Gateway binary |
| `build-agent` | ubuntu-latest | Build Agent binary |
| `build-frontend` | ubuntu-latest | Build Next.js frontend |
| `docker-build-test` | ubuntu-latest | Test Docker builds (no push); uses `cmd/agent/Dockerfile` |

### Release Workflow Jobs

| Job | Runs On | Purpose |
|-----|---------|---------|
| `build-binaries` | ubuntu-latest | Cross-compile Go binaries |
| `build-push-images` | ubuntu-latest | Build and push Docker images |
| `create-release` | ubuntu-latest | Create GitHub release with artifacts |

## 9. Release Process

### Automated Release Flow

```
1. Developer merges PR or pushes to master/main with releasable commits:
   - Conventional: feat:, fix:, perf:, or BREAKING CHANGE:
   - Merge commits: "Merge pull request #N" (treated as minor)
   - Title-style: "Feat/..." or "feat ..." (treated as minor)

2. Release workflow (release.yml) runs on push to master/main:
   - analyze-commits: sets should_release and bump_type from commit messages
   - If should_release: version-bump (updates VERSION, commits, tags v*)
   - build-binaries: cross-compile gateway and agent
   - build-push-images: build and push gateway, frontend, agent (using cmd/agent/Dockerfile)
   - package-helm: package Helm chart
   - create-release: GitHub Release with binaries, checksums, release notes

3. Artifacts available:
   - DockerHub: hellodk/avika-gateway:vX.Y.Z, latest, sha-*
   - DockerHub: hellodk/avika-frontend:vX.Y.Z, latest, sha-*
   - DockerHub: hellodk/avika-agent:vX.Y.Z, latest, sha-*
   - GitHub Release: gateway-*, agent-* binaries, helm chart, checksums.txt
```

Separately, **Build on Merge** runs on every push to master/main and pushes `latest` and `sha-<sha>` so images are always available even when no release is created.

### Manual Release (workflow_dispatch)

```bash
# Trigger via GitHub UI or CLI (bump_type: auto | patch | minor | major)
gh workflow run release.yml -f bump_type=minor
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
