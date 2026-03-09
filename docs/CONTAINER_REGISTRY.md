# Container image registry (single source of truth)

Avika uses **GitHub Container Registry (GHCR)** for Docker images. The registry base URL is defined in one place and used everywhere.

## Single source of truth

| Location | Purpose |
|----------|---------|
| **`.github/IMAGE_REGISTRY`** | One line: registry base (e.g. `ghcr.io/hellodk`). Used by CI and Release workflows. |
| **`deploy/helm/avika/values.yaml`** → `global.imageRegistry` | Must match `.github/IMAGE_REGISTRY`. Used by Helm for gateway and frontend images. |

**To change the registry:** edit `.github/IMAGE_REGISTRY` and `deploy/helm/avika/values.yaml` → `global.imageRegistry` so they stay in sync.

## Image names

- `ghcr.io/hellodk/avika-gateway`
- `ghcr.io/hellodk/avika-frontend`
- `ghcr.io/hellodk/avika-agent`

## Authentication

- **CI / Release:** workflows log in to `ghcr.io` with `GITHUB_TOKEN` (no separate secret needed for public images).
- **Pull from GHCR:** public images can be pulled without login. For private packages, use a PAT with `read:packages` and `docker login ghcr.io -u USERNAME -p PAT`.

## Helm

Gateway and frontend use `global.imageRegistry` + short name (`avika-gateway`, `avika-frontend`) when `image.useGlobalRegistry: true`. Other components (e.g. Postgres, OTEL) use `image.repository` as-is.
