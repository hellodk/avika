#!/usr/bin/env bash
# Create GitHub issues from the Agent Features implementation plan and optionally add to a Project.
# Prerequisites: gh auth login (and gh auth refresh -s project if adding to project).
# Usage: GITHUB_PROJECT_NUMBER=1 ./scripts/onboard-issues-to-project.sh
#        Or: ./scripts/onboard-issues-to-project.sh  (issues only, no project)

set -e
REPO="${REPO:-hellodk/avika}"
PROJECT_OWNER="${PROJECT_OWNER:-hellodk}"
PROJECT_NUM="${GITHUB_PROJECT_NUMBER:-}"

if ! command -v gh &>/dev/null; then
  echo "gh CLI not found. Install: https://cli.github.com/"
  exit 1
fi
if ! gh auth status &>/dev/null; then
  echo "Not logged in. Run: gh auth login"
  exit 1
fi

DOC_REF="Implementation plan: [docs/implementation-plan-agent-features.md](https://github.com/${REPO}/blob/master/docs/implementation-plan-agent-features.md)"

# issue: "Title"|phase-N|status-done|body (short)
issues=(
  "Agent: nginx -t before restart (TestConfig + Restart)|phase-1|status-done|Agent runs nginx -t before restart in config/manager.go. Implemented."
  "Frontend API: RestartNginx / StopNginx for restart and stop|phase-1|status-done|Server detail API calls gateway RestartNginx and StopNginx. Implemented."
  "Server detail: toast on restart/stop success or config test failure|phase-1|status-done|UI shows toast with success or error (e.g. config test failed). Implemented."
  "Gateway: HTTP SSE endpoint GET /api/servers/{id}/logs|phase-2|status-todo|Add SSE endpoint or keep gRPC and add Next.js route. See implementation plan Phase 2."
  "Next.js: GET /api/servers/[id]/logs/route.ts streaming from gateway|phase-2|status-todo|Route that calls gateway GetLogs and streams as SSE."
  "Filters: Extend LogRequest with time_range, status_codes, client_ip/cidr, header|phase-2|status-todo|Agent/gateway filter logs before streaming."
  "Frontend: EventSource + filter UI (time, status, IP/CIDR, header)|phase-2|status-todo|Use EventSource with encoded agent id; add filter UI."
  "Agent: Read/write avika-agent.conf; persist and optional restart|phase-3|status-todo|RPC or config service for key=value file; persist and optionally restart agent."
  "Agent: Backup on write (keep 5), list backups, restore by name/index|phase-3|status-todo|Backup on write; list; restore from backup."
  "Gateway: HTTP API get/set agent config; backup list; restore; apply to group|phase-3|status-todo|APIs for config, backups, restore, and apply-to-group."
  "Frontend: Agent Settings – all keys, Save, Restore dropdown, Apply to group|phase-3|status-todo|Agent Settings tab: all keys, Save, Restore from backup, Apply to group."
  "Gateway: GET /api/servers/{agentId}/drift (per-group status)|phase-4|status-done|Resolve agent to groups; return drift status per group. Implemented."
  "Frontend: Drift tab on server detail + inventory Drift column|phase-4|status-done|Drift tab and inventory column with badge/link. Implemented."
  "Agent/Gateway: Report preferred SSH address for multi-interface VMs|phase-5|status-todo|Preferred SSH address (config or heuristic)."
  "Frontend: Use preferred address in ssh:// link; in-browser terminal for VMs|phase-5|status-todo|ssh:// link and optional in-browser terminal."
  "Encoding: agent_id with + encoded everywhere; gateway decodes once|phase-5|status-todo|encodeURIComponent(agent_id) in links and API calls."
)

created=0
for entry in "${issues[@]}"; do
  IFS='|' read -r title phase status body <<< "$entry"
  labels="$phase,$status"
  body_full="${body}

---
${DOC_REF}"
  echo "Creating: $title"
  url=$(gh issue create -R "$REPO" --title "$title" --body "$body_full" --label "$phase" --label "$status") || true
  if [[ -n "$url" ]]; then
    ((created++)) || true
    if [[ -n "$PROJECT_NUM" ]]; then
      if gh project item-add "$PROJECT_NUM" --owner "$PROJECT_OWNER" --url "$url" 2>/dev/null; then
        echo "  -> Added to project #$PROJECT_NUM"
      else
        echo "  -> Created (add to project manually or run: gh auth refresh -s project)"
      fi
    fi
  else
    echo "  -> Skip or failed (may already exist)"
  fi
done
echo "Done. Created $created issues."
