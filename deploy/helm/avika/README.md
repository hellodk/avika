# Avika Helm Chart

Deploy the Avika stack (gateway, frontend, and dependencies) to Kubernetes.

## Deploy with chart values (recommended)

**Always deploy using the chart’s values file.** Do not override image tags with `--set` unless you intend to pin a specific version.

```bash
# From repo root
make deploy
```

Or explicitly:

```bash
helm upgrade -n avika avika ./deploy/helm/avika \
  -f deploy/helm/avika/values.yaml \
  --install
```

- **Namespace:** `avika` (override with `HELM_NAMESPACE=my-ns make deploy`).
- **Images:** Gateway and frontend use the `repository` and `tag` from `values.yaml` (e.g. `hellodk/avika-gateway:latest`, `hellodk/avika-frontend:latest`) with `pullPolicy: Always`.

## Why not override image tags when deploying?

If you run:

```bash
helm upgrade ... --set components.gateway.image.tag=1.6.0 --set components.frontend.image.tag=1.6.0
```

Helm stores those overrides in the release. Later runs of `helm upgrade ... -f values.yaml` will still use the stored `--set` values, so the release stays pinned to 1.6.0 even if `values.yaml` has `tag: "latest"`. To get back to chart values you must use `--reset-values` or avoid `--set` for image tags in the first place.

**Rule:** Use `values.yaml` (and optionally profile overrides) for image tags. Use `make deploy` or the equivalent `helm upgrade ... -f deploy/helm/avika/values.yaml` without `--set components.*.image.tag`.

## Pinning a specific version

To deploy a specific image version on purpose (e.g. for a rollback):

1. Override only for that release:
   ```bash
   helm upgrade -n avika avika ./deploy/helm/avika -f deploy/helm/avika/values.yaml \
     --set components.gateway.image.tag=1.6.0 \
     --set components.frontend.image.tag=1.6.0 \
     --install
   ```
2. To return to “use whatever is in values.yaml” (e.g. latest):
   ```bash
   helm upgrade -n avika avika ./deploy/helm/avika -f deploy/helm/avika/values.yaml --reset-values --install
   ```

## Local build and deploy

1. Build images (e.g. for amd64):
   ```bash
   make docker-all
   ```
2. Deploy using chart values (no `--set` for image tags):
   ```bash
   make deploy
   ```
   If your cluster uses local images (e.g. Kind/Minikube), load them and use `latest` in `values.yaml`, or tag your built images as `latest` so the chart pulls them.

## Gateway external URL (cluster FQDN) and HTTPS

To have the frontend use the cluster FQDN instead of the internal service `http://avika-gateway:5021`, set `gatewayExternalUrl` in `values.yaml` (or via `--set`):

```yaml
gatewayExternalUrl: "https://avika.example.com"
```

- **HTTP:** Use `http://avika.example.com` (or your FQDN). The frontend will use it for API and WebSocket (`ws://`).
- **HTTPS:** Use `https://avika.example.com`. The frontend will use it for API and secure WebSocket (`wss://`) in the same way. The `/api/config` endpoint returns `https://` and `wss://` when the URL scheme is `https`.

When set, the frontend’s server-side and client-side gateway calls use this URL; gRPC from the frontend pod to the gateway remains internal.

## Values and profiles

- **Default:** `deploy/helm/avika/values.yaml` — gateway and frontend use `tag: "latest"` and `pullPolicy: Always`.
- **Profiles:** Optional overrides under `deploy/helm/avika/profiles/` (e.g. `test.yaml`, `enterprise.yaml`). Use with `-f`:
  ```bash
  helm upgrade -n avika avika ./deploy/helm/avika \
    -f deploy/helm/avika/values.yaml \
    -f deploy/helm/avika/profiles/enterprise.yaml \
    --install
  ```

## Summary

| Goal                         | Command / behavior |
|-----------------------------|--------------------|
| Deploy with chart images    | `make deploy` or `helm upgrade ... -f deploy/helm/avika/values.yaml --install` |
| Do not pin by accident      | Avoid `--set components.gateway.image.tag` and `--set components.frontend.image.tag` |
| Pin version for one release | Use `--set ...image.tag=<version>`; return with `--reset-values` next time |
