# Exposing Avika Gateway with HAProxy or NGINX

This guide demonstrates how to externally expose the Kubernetes-deployed Avika Gateway service logic (gRPC pipelines, standard HTTP APIs, and WebSocket terminals) leveraging either an external **HAProxy** load balancer or **NGINX** reverse proxy.

## Architecture

The Avika Gateway exposes three internal ports on the pod:
- **`5020`**: gRPC (High-frequency agent communication) -> Requires HTTP/2
- **`5021`**: HTTP & WebSockets -> Requires HTTP/1.1 `Connection: Upgrade` headers for terminal continuity
- **`5022`**: Metrics -> Internal Prometheus scraping (not exposed by default)

Both the NGINX and HAProxy configurations provided in this guide split the inbound traffic across `443` and `8443` (for gRPC) terminating SSL identically.

## Usage

### 1. Using HAProxy
The configurations define an HAProxy router tracking Kubernetes CoreDNS (defaulted to `10.96.0.10:53`) to load-balance backend requests directed to `avika-gateway.avika.svc.cluster.local`. 

To deploy HAProxy locally via Docker against K8s or a standalone infrastructure:
```bash
docker run -d \
  --name avika-haproxy \
  -v $(pwd)/deploy/haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
  -v /path/to/certs:/etc/haproxy/certs:ro \
  -p 443:443 \
  -p 8443:8443 \
  haproxy:latest
```

### 2. Using NGINX
If utilizing standard NGINX:
```bash
docker run -d \
  --name avika-nginx \
  -v $(pwd)/deploy/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /path/to/certs:/etc/nginx/certs:ro \
  -p 443:443 \
  -p 8443:8443 \
  nginx:latest
```

## Considerations

1. **DNS Resolvers:** Ensure you modify the internal resolvers set inside the config (`10.96.0.10:53` in NGINX, `k8s` resolver inside HAProxy) if your CoreDNS/KubeDNS IP differs or if you are running this outside of the standard internal Kubernetes network.
2. **Timeouts:** Both configurations extend `timeout tunnel`, `proxy_read_timeout`, and `grpc_read_timeout` to `1h` systematically to prevent premature eviction of long-running WebSocket terminal sessions and heartbeat tracks.
3. **mTLS Agents:** If your Avika Gateway pods strictly enforce mTLS authentication inherently (as part of recent parity updates), ensure your proxies pass the packets transparently, or attach appropriate client CA certs at the backend proxy definitions (`grpcs://` blocks instead of `grpc://`).
