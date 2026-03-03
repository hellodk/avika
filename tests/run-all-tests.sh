#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p tests/reports/summary

ts="$(date -u +%Y%m%dT%H%M%SZ)"
summary="tests/reports/summary/run-${ts}.log"

GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://localhost:5021}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://localhost:3000/avika}"

{
  echo "== Avika master test run =="
  echo "Timestamp(UTC)=${ts}"
  echo "GATEWAY_BASE_URL=${GATEWAY_BASE_URL}"
  echo "FRONTEND_BASE_URL=${FRONTEND_BASE_URL}"
  echo

  echo "== 1) Unit tests (Go + Frontend) =="
  make test-unit
  echo

  echo "== 2) Integration tests (Go -tags=integration, Docker postgres) =="
  make setup-test-db
  trap 'make teardown-test-db || true' EXIT
  make test-integration
  make teardown-test-db || true
  trap - EXIT
  echo

  echo "== 3) E2E tests (Playwright) =="
  # Playwright config uses BASE_URL; we pass frontend URL.
  BASE_URL="${FRONTEND_BASE_URL}" npm -C frontend run test:e2e
  echo

  echo "== 4) Security baseline tests =="
  BASE_URL="${GATEWAY_BASE_URL}" OUT_DIR="tests/reports/security" bash tests/security/run-all.sh
  echo

  echo "== 5) Performance baseline tests (k6 via container) =="
  # Uses dockerized k6 so it does not depend on local k6 installation.
  # NOTE: requires gateway to be reachable from this machine (use port-forward if needed).
  for script in load-test.js api-benchmark.js spike-test.js stress-test.js; do
    echo "-- k6: ${script} --"
    docker run --rm -e BASE_URL="${GATEWAY_BASE_URL}" -i grafana/k6:latest run - < "tests/performance/k6/${script}"
  done
  echo

  echo "Master test run complete"
} 2>&1 | tee "${summary}"

echo "Wrote ${summary}"

