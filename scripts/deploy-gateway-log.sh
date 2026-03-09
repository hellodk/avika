#!/usr/bin/env bash
# Push gateway image with tag "log" and deploy only the gateway in avika namespace.
# Prerequisite: docker build -t ghcr.io/hellodk/avika-gateway:log -f cmd/gateway/Dockerfile . (or make docker-gateway then docker tag)

set -e
IMAGE="${IMAGE:-ghcr.io/hellodk/avika-gateway:log}"
NAMESPACE="${NAMESPACE:-avika}"

echo "Pushing $IMAGE ..."
docker push "$IMAGE"

echo "Updating gateway deployment in namespace $NAMESPACE to use $IMAGE ..."
# Option A: kubectl set image (only gateway deployment)
kubectl set image deployment/avika-gateway gateway="$IMAGE" -n "$NAMESPACE" 2>/dev/null || \
kubectl set image deployment/gateway gateway="$IMAGE" -n "$NAMESPACE" 2>/dev/null || {
  echo "Trying helm upgrade with gateway image tag 'log'..."
  helm upgrade avika deploy/helm/avika -n "$NAMESPACE" --set components.gateway.image.tag=log --reuse-values
  exit 0
}

echo "Rolling out gateway..."
kubectl rollout status deployment/avika-gateway -n "$NAMESPACE" 2>/dev/null || kubectl rollout status deployment/gateway -n "$NAMESPACE"
echo "Done. Check logs: kubectl logs -f deployment/avika-gateway -n avika"
echo "Or: kubectl logs -f deployment/gateway -n avika"
