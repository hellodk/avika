# Container image registry (single source of truth)

Avika uses **Docker Hub** (`docker.io/hellodk`) for Docker images. The registry base URL is defined in one place and used everywhere.

## Single source of truth

| Location | Purpose |
|----------|---------|
| **`.github/IMAGE_REGISTRY`** | One line: registry base (e.g. `docker.io/hellodk`). Used by CI and Release workflows. |
| **`deploy/helm/avika/values.yaml`** → `global.imageRegistry` | Must match `.github/IMAGE_REGISTRY`. Used by Helm for gateway and frontend images. |

**To change the registry:** edit `.github/IMAGE_REGISTRY` and `deploy/helm/avika/values.yaml` → `global.imageRegistry` so they stay in sync.

## Image names

- `docker.io/hellodk/avika-gateway`
- `docker.io/hellodk/avika-frontend`
- `docker.io/hellodk/avika-agent`

## Authentication

- **CI / Release:** workflows log in to Docker Hub with `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (repository secrets). See [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md).
- **Pull from Docker Hub:** public images can be pulled without login. For private repos, use `docker login -u USERNAME -p TOKEN`.

## Helm

Gateway and frontend use `global.imageRegistry` + short name (`avika-gateway`, `avika-frontend`) when `image.useGlobalRegistry: true`. Other components (e.g. Postgres, OTEL) use `image.repository` as-is.
