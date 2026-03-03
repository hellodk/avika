# Avika Test Environment Deployment Plan

## Overview

This deployment plan uses Helm charts exclusively for deploying Avika to the `avika-test` namespace. All sensitive values are passed via `--set` flags - no hardcoded secrets in charts.

## Changes Made

### 1. Hardcoded Values Removed from Templates

| File | Before | After |
|------|--------|-------|
| `deployment.yaml` | `busybox:1.36` hardcoded | `{{ $.Values.global.initImage.repository }}:{{ $.Values.global.initImage.tag }}` |
| `deployment.yaml` | Port `5432` hardcoded | `{{ (index $.Values.components "postgresql").ports.tcp.containerPort }}` |
| `deployment.yaml` | Port `8123` hardcoded | `{{ (index $.Values.components "clickhouse").ports.http.containerPort }}` |
| `deployment.yaml` | `CLICKHOUSE_USER: "default"` | `{{ $chComp.env.CLICKHOUSE_USER }}` |
| `external-secrets.yaml` | `role: "avika"` | `{{ .Values.vault.injector.kubernetesRole }}` |
| `external-secrets.yaml` | `key: avika/postgresql` | `{{ $vaultPath }}/{{ $vaultPaths.postgresql }}` |

### 2. New Configurable Values in `values.yaml`

```yaml
global:
  initImage:
    repository: busybox
    tag: "1.36"
  serviceType: ClusterIP

externalPostgres:
  enabled: false
  host: ""
  port: 5432
  database: "avika"
  username: "admin"

externalClickhouse:
  enabled: false
  host: ""
  port: 9000
  httpPort: 8123
  database: "nginx_analytics"
  username: "default"

vault:
  injector:
    enabled: false
    kubernetesRole: "avika"
    paths:
      postgresql: "postgresql"
      clickhouse: "clickhouse"
      redpanda: "redpanda"
```

### 3. Components Enabled/Disabled

| Component | Status | Reason |
|-----------|--------|--------|
| gateway | ✅ Enabled | Core API server |
| frontend | ✅ Enabled | Web UI |
| postgresql | ❌ Disabled | Using external DB in `avika` namespace |
| clickhouse | ❌ Disabled | Using external DB in `avika` namespace |
| otel-collector | ❌ Disabled | Not needed for test |
| redpanda | ❌ Disabled | Not needed for test |
| ingress | ❌ Disabled | Use port-forward for test |

---

## Pre-Deployment Verification

### Step 1: Verify Kubernetes Connectivity

```bash
kubectl cluster-info
```

### Step 2: Verify External Databases are Accessible

```bash
# Check PostgreSQL
kubectl get svc -n avika | grep postgresql

# Check ClickHouse
kubectl get svc -n avika | grep clickhouse
```

### Step 3: Verify Existing Secrets

```bash
# Verify secrets exist in avika namespace
kubectl get secret avika-db-secrets -n avika
```

---

## Deployment Commands

### Step 1: Create Namespace (if not exists)

```bash
kubectl create namespace avika-test --dry-run=client -o yaml | kubectl apply -f -
```

### Step 2: Fetch Secrets from Existing Deployment

```bash
# Store secrets in environment variables
export POSTGRES_PASSWORD=$(kubectl get secret avika-db-secrets -n avika -o jsonpath='{.data.postgres-password}' | base64 -d)
export CLICKHOUSE_PASSWORD=$(kubectl get secret avika-db-secrets -n avika -o jsonpath='{.data.clickhouse-password}' | base64 -d)
export JWT_SECRET=$(openssl rand -hex 32)
```

### Step 3: Dry Run - Review Generated Manifests

```bash
cd /home/dk/Documents/git/nginx-manager-cursor

helm upgrade --install avika-test ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/test.yaml \
  --namespace avika-test \
  --set secrets.postgres.password="$POSTGRES_PASSWORD" \
  --set secrets.clickhouse.password="$CLICKHOUSE_PASSWORD" \
  --set auth.jwtSecret="$JWT_SECRET" \
  --dry-run
```

### Step 4: Deploy to avika-test Namespace

```bash
cd /home/dk/Documents/git/nginx-manager-cursor

helm upgrade --install avika-test ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/test.yaml \
  --namespace avika-test \
  --set secrets.postgres.password="$POSTGRES_PASSWORD" \
  --set secrets.clickhouse.password="$CLICKHOUSE_PASSWORD" \
  --set auth.jwtSecret="$JWT_SECRET" \
  --wait \
  --timeout 5m
```

### Step 5: Verify Deployment

```bash
# Check pods
kubectl get pods -n avika-test -w

# Check services
kubectl get svc -n avika-test

# Check deployments
kubectl get deployments -n avika-test

# View pod logs
kubectl logs -n avika-test -l component=gateway --tail=50
kubectl logs -n avika-test -l component=frontend --tail=50
```

---

## Post-Deployment Access

### Option A: Port Forward (Recommended for Testing)

```bash
# Terminal 1: Frontend
kubectl port-forward svc/avika-test-frontend 5031:5031 -n avika-test

# Terminal 2: Gateway API
kubectl port-forward svc/avika-test-gateway 5020:5020 5021:5021 -n avika-test
```

Access at: http://localhost:5031/avika

### Option B: NodePort (if needed)

```bash
helm upgrade avika-test ./deploy/helm/avika \
  -f ./deploy/helm/avika/profiles/test.yaml \
  --namespace avika-test \
  --set secrets.postgres.password="$POSTGRES_PASSWORD" \
  --set secrets.clickhouse.password="$CLICKHOUSE_PASSWORD" \
  --set auth.jwtSecret="$JWT_SECRET" \
  --set components.frontend.service.type=NodePort \
  --set components.gateway.service.type=NodePort
```

---

## Rollback Commands

### Rollback to Previous Revision

```bash
helm rollback avika-test -n avika-test
```

### Uninstall Completely

```bash
helm uninstall avika-test -n avika-test
kubectl delete namespace avika-test
```

---

## Secrets Management Strategy

### Why `--set` for Secrets?

1. **No hardcoded secrets** - Secrets never stored in git
2. **Environment-specific** - Different secrets per environment
3. **Rotation friendly** - Easy to rotate without chart changes
4. **CI/CD integration** - Secrets injected from CI/CD secret stores

### Alternative: External Secrets Operator (Production)

For production, enable Vault integration:

```bash
helm upgrade avika-prod ./deploy/helm/avika \
  --set vault.enabled=true \
  --set vault.injector.enabled=true \
  --set vault.address="https://vault.example.com:8200" \
  --set vault.injector.kubernetesRole="avika-prod"
```

---

## Summary

| Item | Status |
|------|--------|
| Hardcoded values removed | ✅ |
| Secrets via `--set` | ✅ |
| External DB configuration | ✅ |
| nodeSelector for amd64 | ✅ |
| Init containers dynamic | ✅ |
| Unused components disabled | ✅ |
| Helm-only deployment | ✅ |
