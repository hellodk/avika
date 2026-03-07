#!/usr/bin/env bash
# Deploy avika-frontend and avika-gateway with a PR image tag (e.g. pr-58).
# Usage: ./scripts/deploy-pr-tag.sh pr-58
# Requires: helm, kubectl context pointing at target cluster

set -e

TAG="${1:?Usage: $0 <tag> (e.g. pr-58)}"
NAMESPACE="${HELM_NAMESPACE:-avika}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Deploying Avika gateway and frontend with image tag: $TAG (namespace: $NAMESPACE)"
helm upgrade -n "$NAMESPACE" avika "$REPO_ROOT/deploy/helm/avika" \
  -f "$REPO_ROOT/deploy/helm/avika/values.yaml" \
  --set components.gateway.image.tag="$TAG" \
  --set components.frontend.image.tag="$TAG" \
  --install

echo "Done. Gateway and frontend are now using tag: $TAG"
