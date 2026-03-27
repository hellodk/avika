# DEPRECATED

HAProxy routing for the Avika platform has been **deprecated** in favor of an **NGINX proxy**. 

The NGINX proxy now manages TLS termination and gRPC/HTTP multiplexing automatically on port 443. All new K8s service integrations natively expose 443 to standard clients. 

These configurations are retained solely for backward compatibility with existing legacy deployments. Please refer to the Kubernetes NGINX ingress/proxy configurations inside `deploy/helm/avika/` going forward.
