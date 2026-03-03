#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5021}"
OUT_DIR="${OUT_DIR:-tests/reports/security}"
mkdir -p "${OUT_DIR}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="${OUT_DIR}/auth-tests-${ts}.log"

{
  echo "== Auth baseline tests =="
  echo "BASE_URL=${BASE_URL}"
  echo "Timestamp(UTC)=${ts}"
  echo

  echo "-- Login invalid password (expect failure) --"
  curl -sS -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrongpass"}'
  echo
  echo

  echo "-- Access projects unauthenticated (expect 401/403) --"
  curl -sS -i "${BASE_URL}/api/projects" | head -40
  echo
  echo

  echo "-- Login valid (expect session cookie) --"
  rm -f /tmp/avika-cookies.txt
  curl -sS -c /tmp/avika-cookies.txt -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin"}' > /dev/null
  tail -5 /tmp/avika-cookies.txt || true
  echo
  echo

  echo "-- Access projects with cookie (expect 200 and JSON array) --"
  curl -sS -b /tmp/avika-cookies.txt "${BASE_URL}/api/projects" | head -c 400
  echo
  echo

  echo "-- /api/auth/me with cookie (behavior may vary; should not error) --"
  curl -sS -i -b /tmp/avika-cookies.txt "${BASE_URL}/api/auth/me" | head -60 || true
  echo
} | tee "${out}"

echo "Wrote ${out}"

