#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5021}"
OUT_DIR="${OUT_DIR:-tests/reports/security}"

echo "Running security baseline suite"
echo "BASE_URL=${BASE_URL}"
echo "OUT_DIR=${OUT_DIR}"

bash tests/security/header-tests.sh
bash tests/security/auth-tests.sh
bash tests/security/injection-tests.sh

echo "Security suite complete"

