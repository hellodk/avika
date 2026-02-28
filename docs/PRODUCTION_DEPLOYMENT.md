# Avika Agent Production Deployment Guide

This guide covers production-ready deployment patterns for the Avika NGINX monitoring agent.

## Deployment Patterns

### Pattern 1: Sidecar (Recommended for Kubernetes)

The agent runs as a sidecar container alongside NGINX in the same pod.

```
┌─────────────────────────────────────────────────────┐
│                      Pod                            │
│  ┌────────────────┐    ┌────────────────────────┐  │
│  │     NGINX      │    │    Avika Agent         │  │
│  │    :80/:443    │    │    (sidecar)           │  │
│  │                │    │                        │  │
│  │  writes logs → │    │ ← reads logs           │  │
│  └───────┬────────┘    └───────────┬────────────┘  │
│          │                         │               │
│          └──────┬──────────────────┘               │
│                 │ shared volume                    │
│          /var/log/nginx/                           │
└─────────────────────────────────────────────────────┘
```

**Pros:**
- Independent lifecycle (update agent without restarting NGINX)
- Separate resource limits
- Fault isolation
- Standard Kubernetes pattern

**Cons:**
- Slightly more complex configuration
- Requires shared volumes

### Pattern 2: Bundled Container (Dev/Test only)

NGINX and agent run in a single container.

```
┌─────────────────────────────────────────┐
│           Container                     │
│  ┌─────────────────────────────────┐   │
│  │  NGINX + Agent (same process)   │   │
│  │  start.sh manages both          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Pros:**
- Simple deployment
- No volume configuration needed

**Cons:**
- Coupled lifecycle
- No resource isolation
- Not recommended for production

### Pattern 3: DaemonSet (Special use cases)

One agent per node monitoring all NGINX instances.

**Use cases:**
- Bare-metal deployments
- Single-tenant clusters
- VMs with multiple NGINX instances

## Quick Start

### Deploy Sidecar Pattern

```bash
# Create namespace
kubectl create namespace production

# Deploy NGINX + Avika agent sidecar
kubectl apply -f deploy/k8s/nginx-sidecar-production.yaml

# Verify pods are running
kubectl get pods -n production -l app=nginx

# Check agent logs
kubectl logs -n production -l app=nginx -c avika-agent
```

### Verify Agent Connection

```bash
# Check agent health
kubectl exec -n production deploy/nginx -c avika-agent -- \
  curl -s localhost:5026/healthz

# Check agent is connected to gateway
kubectl logs -n production -l app=nginx -c avika-agent | grep -i "connected"
```

## Configuration

### Required Configuration

Update `avika-agent-config` ConfigMap with your gateway address:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: avika-agent-config
  namespace: production
data:
  avika-agent.conf: |
    # Update this to your Avika gateway address
    GATEWAYS="avika-gateway.avika.svc.cluster.local:5020"
    
    # Other settings...
```

### Environment Variables

The agent supports configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `AVIKA_GATEWAY_ADDR` | Gateway address | From config file |
| `AVIKA_AGENT_ID` | Agent identifier | Auto-detected |
| `AVIKA_LOG_LEVEL` | Log verbosity | `info` |
| `AVIKA_STUB_STATUS_URL` | NGINX status URL | `http://127.0.0.1/nginx_status` |

### Resource Recommendations

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| NGINX | 100m | 1000m | 128Mi | 512Mi |
| Avika Agent | 50m | 200m | 64Mi | 128Mi |

Adjust based on your traffic volume. The agent is lightweight and typically uses:
- ~50MB memory at steady state
- <5% CPU under normal load

## Security

### Security Contexts

The production template includes:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true  # Agent only
  capabilities:
    drop:
    - ALL
```

### Network Policies

Enable network policies to restrict agent communication:

```yaml
egress:
# Allow DNS
- to:
  - namespaceSelector: {}
  ports:
  - protocol: UDP
    port: 53
# Allow Avika gateway only
- to:
  - namespaceSelector:
      matchLabels:
        name: avika
  ports:
  - protocol: TCP
    port: 5020
```

### RBAC (if needed)

The agent doesn't require special Kubernetes permissions by default. If you enable features like:
- Pod metadata collection
- ConfigMap watching

You'll need a ServiceAccount with appropriate roles.

## High Availability

### Pod Disruption Budget

Ensures minimum availability during maintenance:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: nginx-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: nginx
```

### Anti-Affinity

Spreads pods across nodes:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app: nginx
        topologyKey: kubernetes.io/hostname
```

### Horizontal Pod Autoscaler

Auto-scales based on load:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Monitoring

### Health Endpoints

| Endpoint | Port | Description |
|----------|------|-------------|
| `/healthz` | 5026 | Liveness check |
| `/readyz` | 5026 | Readiness check |
| `/metrics` | 5026 | Prometheus metrics |

### Prometheus Integration

Add annotations for auto-discovery:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "5026"
  prometheus.io/path: "/metrics"
```

### Logging

Agent logs are sent to stdout by default. In Kubernetes, use:

```bash
# Follow agent logs
kubectl logs -n production -l app=nginx -c avika-agent -f

# Search for errors
kubectl logs -n production -l app=nginx -c avika-agent | grep -i error
```

## Troubleshooting

### Agent Not Connecting

1. Check gateway address is correct:
   ```bash
   kubectl exec -n production deploy/nginx -c avika-agent -- \
     cat /etc/avika/avika-agent.conf | grep GATEWAY
   ```

2. Verify network connectivity:
   ```bash
   kubectl exec -n production deploy/nginx -c avika-agent -- \
     nc -zv avika-gateway.avika.svc.cluster.local 5020
   ```

3. Check agent logs:
   ```bash
   kubectl logs -n production deploy/nginx -c avika-agent --tail=50
   ```

### NGINX Version Not Detected

Ensure `shareProcessNamespace: true` is set in the pod spec:

```yaml
spec:
  shareProcessNamespace: true
```

### Logs Not Being Collected

1. Verify log files exist (not symlinks):
   ```bash
   kubectl exec -n production deploy/nginx -c nginx -- \
     ls -la /var/log/nginx/
   ```

2. Check init container ran successfully:
   ```bash
   kubectl describe pod -n production -l app=nginx | grep -A5 "Init Containers"
   ```

## Migration from Bundled to Sidecar

1. **Update Deployment**: Replace bundled image with separate containers
2. **Add Shared Volume**: Configure emptyDir for logs
3. **Add Init Container**: Set up log files
4. **Update ConfigMap**: Ensure agent config matches new paths
5. **Rolling Update**: Deploy with zero downtime

```bash
# Apply new configuration
kubectl apply -f deploy/k8s/nginx-sidecar-production.yaml

# Monitor rollout
kubectl rollout status deployment/nginx -n production
```

## Files Reference

| File | Description |
|------|-------------|
| `deploy/k8s/nginx-sidecar-production.yaml` | Complete production deployment |
| `deploy/k8s/nginx-test-stack.yaml` | Test/dev deployment (bundled) |
| `cmd/agent/Dockerfile.standalone` | Standalone agent image |
| `nginx-agent/Dockerfile` | Bundled nginx+agent image |
| `deploy/config/avika-agent.conf.sample` | Full configuration reference |
