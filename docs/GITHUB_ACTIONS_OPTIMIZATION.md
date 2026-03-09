# GitHub Actions – Optimizations and Fixes

## Changes applied (to fix failing CI)

### 1. **CI workflow (`.github/workflows/ci.yml`)**

- **Go version**: `1.23` → `1.24` to match `go.mod` (1.24.x).
- **Test job**: Replaced `go test ./...` with:
  ```yaml
  go test -v -race -coverprofile=coverage.out ./cmd/... ./internal/...
  ```
  **Reason**: The repo root contains multiple `main` packages (`check_grpc.go`, `check_ch.go`, `test_grpc.go`), so `go test ./...` fails with "main redeclared". Limiting to `./cmd/...` and `./internal/...` tests only the real application code.
- **Lint job**: Scoped golangci-lint to the same packages:
  ```yaml
  args: --timeout=5m ./cmd/... ./internal/...
  ```
  Keeps lint consistent with what is tested and avoids issues with the root scripts.

### 2. **Release workflow (`.github/workflows/release.yml`)**

- **Go version**: `1.23` → `1.24` for consistency with the rest of the repo.

### 3. **Optional follow-ups**

- **Root scripts**: Consider moving `check_grpc.go`, `check_ch.go`, and `test_grpc.go` into e.g. `scripts/` or a small `cmd/check-*` so the root is not a multi-main package. Then CI could use `go test ./...` again if desired.
- **Build on PR / Build on Merge**: Images are pushed to GitHub Container Registry (GHCR) using `GITHUB_TOKEN`; no Docker Hub token needed. Ensure `RELEASE_TOKEN` (or bypass for release) if using the Release workflow.
- **arm64 (Build on Merge)**: Uses `runs-on: ubuntu-24.04-arm`. If that runner is unavailable in your org, switch to a single-platform build or use QEMU on `ubuntu-latest` for multi-arch.

## Workflow summary

| Workflow           | Trigger              | Purpose                                      |
|--------------------|----------------------|----------------------------------------------|
| **CI**             | PR / push to branches| Lint, test, build binaries, Docker build    |
| **Build on PR**    | PR to main/develop   | Build and push Docker images (pr-*, sha-*)  |
| **Build on Merge** | Push to main/develop | Build and push multi-arch (latest/branch tag)|
| **Release**       | Push to master/main  | Version bump, binaries, images, Helm, GitHub Release |

## Required secrets

- **GHCR (images)**: No extra secret; workflows use `GITHUB_TOKEN` to push to `ghcr.io`. Registry base is set in [.github/IMAGE_REGISTRY](../../.github/IMAGE_REGISTRY). See [CONTAINER_REGISTRY.md](CONTAINER_REGISTRY.md).
- **RELEASE_TOKEN** (optional): For Release workflow to push version bump and tags; falls back to `GITHUB_TOKEN` if unset.

## Release workflow and branch protection

If the **Release** workflow fails at **Bump Version** with `GH013` / "repository rule violations" (e.g. "Changes must be made through a pull request"), the default branch is protected and the workflow cannot push the version-bump commit. **Fix:** add **github-actions[bot]** to the bypass list of that branch rule. See [GITHUB_RELEASE_BYPASS.md](GITHUB_RELEASE_BYPASS.md).
