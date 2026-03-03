#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5021}"
OUT_DIR="${OUT_DIR:-tests/reports/security}"
mkdir -p "${OUT_DIR}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="${OUT_DIR}/injection-tests-${ts}.log"

{
  echo "== Injection tests =="
  echo "BASE_URL=${BASE_URL}"
  echo "Timestamp(UTC)=${ts}"
  echo

  echo "-- SQLi probe (should not return data or 200 with unexpected payload) --"
  curl -sS -i "${BASE_URL}/api/projects/1%27%20OR%201=1--" | head -50
  echo

  echo "-- XSS probe (reflected, should be escaped/blocked) --"
  curl -sS -i "${BASE_URL}/api/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E" | head -50 || true
  echo
} | tee "${out}"

echo "Wrote ${out}"

