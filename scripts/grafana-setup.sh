#!/bin/bash
# Setup Avika dashboards in Grafana (kube-prometheus-stack)
# This script creates the Avika folder and organizes dashboards

set -e

GRAFANA_NAMESPACE="${GRAFANA_NAMESPACE:-monitoring}"
GRAFANA_SERVICE="${GRAFANA_SERVICE:-monitoring-grafana}"
LOCAL_PORT="${LOCAL_PORT:-3001}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📊 Avika Grafana Dashboard Setup${NC}"
echo "=================================="

# Get Grafana credentials
echo -e "${YELLOW}Getting Grafana credentials...${NC}"
GRAFANA_PASS=$(kubectl -n "${GRAFANA_NAMESPACE}" get secret "${GRAFANA_SERVICE}" -o jsonpath='{.data.admin-password}' | base64 -d)
GRAFANA_USER=$(kubectl -n "${GRAFANA_NAMESPACE}" get secret "${GRAFANA_SERVICE}" -o jsonpath='{.data.admin-user}' | base64 -d)

# Start port-forward in background
echo -e "${YELLOW}Starting port-forward to Grafana...${NC}"
pkill -f "port-forward.*${GRAFANA_SERVICE}" 2>/dev/null || true
sleep 1
kubectl -n "${GRAFANA_NAMESPACE}" port-forward "svc/${GRAFANA_SERVICE}" "${LOCAL_PORT}:80" &
PF_PID=$!
sleep 3

# Cleanup function
cleanup() {
    kill $PF_PID 2>/dev/null || true
}
trap cleanup EXIT

GRAFANA_URL="http://localhost:${LOCAL_PORT}"
AUTH="${GRAFANA_USER}:${GRAFANA_PASS}"

# 1. Create Avika folder if it doesn't exist
echo -e "${YELLOW}Creating Avika folder...${NC}"
FOLDER_RESPONSE=$(curl -s -X POST -u "${AUTH}" \
    -H "Content-Type: application/json" \
    -d '{"title": "Avika"}' \
    "${GRAFANA_URL}/api/folders" 2>/dev/null)

if echo "$FOLDER_RESPONSE" | grep -q '"title":"Avika"'; then
    FOLDER_UID=$(echo "$FOLDER_RESPONSE" | jq -r '.uid')
    echo -e "${GREEN}  ✓ Created Avika folder (uid: ${FOLDER_UID})${NC}"
elif echo "$FOLDER_RESPONSE" | grep -q "already exists"; then
    # Get existing folder UID
    FOLDER_UID=$(curl -s -u "${AUTH}" "${GRAFANA_URL}/api/folders" | jq -r '.[] | select(.title == "Avika") | .uid')
    echo -e "${GREEN}  ✓ Avika folder exists (uid: ${FOLDER_UID})${NC}"
else
    echo -e "${YELLOW}  Folder response: ${FOLDER_RESPONSE}${NC}"
    FOLDER_UID=$(curl -s -u "${AUTH}" "${GRAFANA_URL}/api/folders" | jq -r '.[] | select(.title == "Avika") | .uid')
fi

if [ -z "$FOLDER_UID" ]; then
    echo -e "${YELLOW}  ⚠ Could not get folder UID, dashboards will remain in General${NC}"
    exit 0
fi

# 2. Get all Avika dashboards not in the Avika folder
echo -e "${YELLOW}Finding Avika dashboards...${NC}"
DASHBOARDS=$(curl -s -u "${AUTH}" "${GRAFANA_URL}/api/search?type=dash-db" | \
    jq -r '.[] | select(.title | test("^Avika"; "i")) | select(.folderUid != "'"${FOLDER_UID}"'") | .uid')

if [ -z "$DASHBOARDS" ]; then
    echo -e "${GREEN}  ✓ All Avika dashboards are already in the correct folder${NC}"
    exit 0
fi

# 3. Move dashboards to Avika folder
echo -e "${YELLOW}Moving dashboards to Avika folder...${NC}"
for DASH_UID in $DASHBOARDS; do
    if [ -n "$DASH_UID" ]; then
        TITLE=$(curl -s -u "${AUTH}" "${GRAFANA_URL}/api/dashboards/uid/${DASH_UID}" | jq -r '.dashboard.title')
        
        # Move using the dashboard move API (Grafana 9+)
        RESULT=$(curl -s -X POST -u "${AUTH}" \
            -H "Content-Type: application/json" \
            -d "{\"destinationUid\": \"${FOLDER_UID}\"}" \
            "${GRAFANA_URL}/api/dashboards/uid/${DASH_UID}/move" 2>/dev/null)
        
        if echo "$RESULT" | grep -q "slug"; then
            echo -e "${GREEN}  ✓ Moved: ${TITLE}${NC}"
        else
            echo -e "${YELLOW}  ⚠ Could not move: ${TITLE} (provisioned dashboard)${NC}"
        fi
    fi
done

# 4. Verify final state
echo -e ""
echo -e "${BLUE}Final Dashboard Organization:${NC}"
curl -s -u "${AUTH}" "${GRAFANA_URL}/api/search?type=dash-db" | \
    jq -r '.[] | select(.title | test("Avika"; "i")) | "  [\(.folderTitle // "General")] \(.title)"'

echo ""
echo -e "${GREEN}✅ Grafana setup complete${NC}"
echo -e "   Access Avika dashboards: ${GRAFANA_URL}/dashboards/f/${FOLDER_UID}/avika"
