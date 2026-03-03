#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5021}"
OUT_DIR="${OUT_DIR:-tests/reports/security}"
mkdir -p "${OUT_DIR}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="${OUT_DIR}/header-tests-${ts}.log"

{
  echo "== Security header baseline tests =="
  echo "BASE_URL=${BASE_URL}"
  echo "Timestamp(UTC)=${ts}"
  echo

  echo "-- GET /health headers --"
  curl -sS -D - -o /dev/null "${BASE_URL}/health" | sed -n '1,30p'
  echo

  echo "-- GET / (root) headers (may 404) --"
  curl -sS -D - -o /dev/null "${BASE_URL}/" | sed -n '1,30p' || true
  echo

  echo "Expected headers (best effort, depends on gateway config):"
  echo "  - X-Content-Type-Options: nosniff"
  echo "  - X-Frame-Options"
  echo "  - Content-Security-Policy (if enabled)"
  echo "  - Strict-Transport-Security (if TLS termination upstream)"
} | tee "${out}"

echo "Wrote ${out}"

