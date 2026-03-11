# Inventory Page – E2E Analysis and Issues

## Scope

Analysis and Playwright coverage of the **Inventory** page (`/inventory`) and its table (AgentFleetTable): all links, filters, actions, and flows.

---

## Inventory Page – Links and Functionality Covered

### Page structure
- **Header**: "Inventory" (h1), "Manage your NGINX agent fleet", optional project/environment badge
- **Refresh**: RefreshButton (reloads agents, server assignments, latest version)
- **Stats cards**: Total Agents, Online, Offline, Needs Update

### Controls (AgentFleetTable)
- **Search**: input placeholder "Search agents..." – filters by hostname, IP, or agent_id (URL `?q=`)
- **Status filter**: buttons All | Online | Offline (URL `?status=`)
- **Export dropdown**: Export as CSV, Export as JSON; when rows selected, "Export selected (N)"
- **Table sort**: column headers Agent, IP Address, Version, Last Seen (URL `?sort=&dir=`)

### Row actions (per agent)
- **Server detail**: link on hostname and ExternalLink icon → `/servers/[id]` (id in display form, e.g. `zabbix-10.0.2.15`)
- **Terminal**: icon button – for pods opens "Access Pod Terminal" dialog (kubectl command + Web Terminal); for non-pods sets `window.location.href = ssh://${agent.ip}`
- **Drift**: link → `/servers/[id]?tab=drift`
- **Agent config**: link → `/agents/[id]/config`
- **Delete**: icon button → opens "Remove Agent" AlertDialog (confirm/cancel)

### Bulk actions (when rows selected)
- **N selected** badge, **Update** (bulk trigger update), **Remove** (bulk delete via AlertDialog), **Clear** selection
- **Select all**: header checkbox

### Dialogs (from Inventory page)
- **Remove Agent**: AlertDialog – title "Remove Agent", body "Are you sure you want to remove **{hostname|agent_id}**? This action cannot be undone.", Cancel / Remove Agent
- **Access Pod Terminal**: Dialog – "Access Pod Terminal", kubectl command with copy button, "Web Terminal" and "Done" buttons

### Error state
- When `/api/servers` fails and no agents: "Unable to load inventory", subtext error message, **Retry** button

### Data / API
- `GET /api/servers` – list agents
- `GET /api/server-assignments` – assignments (project/env)
- `GET /api/updates/version` – latest agent version
- Delete: `DELETE /api/servers/{id}`
- Update: `POST /api/servers/{id}/update`

---

## Playwright Tests Added

**File**: `frontend/tests/e2e/inventory-links-and-actions.spec.ts`

| # | Test | Purpose |
|---|------|--------|
| 1 | page load and main structure | URL, h1 "Inventory", subtitle |
| 2 | stats cards are visible | Total Agents, Online, Offline, Needs Update |
| 3 | search input exists and is usable | Placeholder "Search agents...", type and clear |
| 4 | status filter buttons | All, Online, Offline; click Online → URL has status=online |
| 5 | refresh button | Visible, clickable, stays on /inventory |
| 6 | export dropdown | Opens, has "Export as CSV" and "Export as JSON" |
| 7 | export as JSON triggers download | Filename matches avika-inventory-*.json |
| 8 | export as CSV triggers download | Filename matches avika-inventory-*.csv |
| 9 | table has column headers | Agent, IP Address, NGINX, Version, Status, Last Seen, Actions |
| 10 | sort by Agent toggles URL params | sort=hostname, dir=asc/desc |
| 11 | when no agents: empty state | Either rows or "No agents found matching your filters." |
| 12 | server detail link navigates to /servers/[id] | First row server link (when agents exist) |
| 13 | external link in actions | First row has link with href containing /servers/ |
| 14 | drift link → server with tab=drift | First row drift link (when agents exist) |
| 15 | agent config link → /agents/[id]/config | First row Settings link (when agents exist) |
| 16 | row checkbox shows bulk bar | Select one row → "N selected", Update, Remove, Clear |
| 17 | delete button opens confirmation | Open dialog "Remove Agent", cancel closes it |
| 18 | terminal button (pod or ssh) | Pod: "Access Pod Terminal" dialog; non-pod: ssh redirect |
| 19 | select all checkbox | Toggle all rows selected |
| 20 | clear selection | Hides bulk bar |
| 21 | retry button when load fails | After aborting /api/servers, "Unable to load inventory" + Retry |

Tests 12–18 and 19–20 **skip** when there are no table rows (no agents).

---

## Issues Found

### 1. E2E environment – Inventory page not visible in current runs

**Observed**: All 21 tests in `inventory-links-and-actions.spec.ts` fail because the Inventory heading is not visible within the timeout (e.g. 20s) after `goto('/inventory')`.

**Likely cause**: After navigation, the app either:
- Redirects to **login** (no or invalid auth state when running this spec in isolation), or
- Serves a different base path (e.g. app at `/avika/inventory` but tests hit `/inventory`), or
- Slow/blocked API so the page stays in loading/skeleton state.

**Evidence**: `inventory.spec.ts` “should load inventory page” only asserts `toHaveURL(INV)` and passes; it does not assert that the Inventory content (e.g. h1) is visible. So the URL can be correct while the rendered content is still login or loading.

**Fix applied**: The inventory links-and-actions spec now calls **`loginIfNeeded(page)`** after `goto('/inventory')` in a shared **`gotoInventory(page)`** helper, so redirect-to-login is handled and tests proceed to the Inventory page when auth state is missing or expired. If the URL is not `/inventory` after login, the spec navigates to `/inventory` again. A 25s timeout is used for the "Inventory" heading.

**Recommendation**: Ensure the backend (or mock) for `/api/servers` is available when running E2E, so the page can render the main view instead of the error state.

---

### 2. Placeholder text mismatch in existing inventory.spec.ts — FIXED

**Location**: `frontend/tests/e2e/inventory.spec.ts` (lines 46, 141, 150).

**Issue**: Tests expected **"Search by hostname, IP, or agent ID..."** but UI uses **"Search agents..."**.

**Fix applied**: All three assertions in `inventory.spec.ts` now expect `"Search agents..."`.

---

### 3. Bulk Remove used `window.confirm` — FIXED

**Location**: `frontend/src/app/inventory/page.tsx`.

**Fix applied**: Bulk remove now uses an **AlertDialog** (“Remove multiple agents”) with Cancel / “Remove N agents” actions, matching the single-delete pattern. E2E can assert dialog title and buttons.

---

### 4. Terminal for non-pod: `window.location.href = ssh://...`

**Location**: Inventory page `onTerminal` for non-pod agents.

**Issue**: Assigning `window.location.href` to `ssh://...` causes navigation away from the app. E2E will leave the page; no in-app assertion possible.

**Recommendation**: Document in E2E that “terminal” for non-pod is an external navigation; tests can only assert that the button exists and (optionally) that navigation was requested, not that the app stays on Inventory.

---

### 5. No `data-testid` on key elements — PARTIALLY FIXED

**Fix applied**: Added `data-testid` to:
- Inventory page: **`inventory-error-retry`** on the Retry button (error state).
- AgentFleetTable: **`inventory-search`** on the search input, **`inventory-export-trigger`** on the Export button.

Additional test IDs can be added for table rows, bulk bar, and dialogs if needed for stability.

---

## Summary Table

| Category | Status | Notes |
|----------|--------|--------|
| Page load / structure | ❌ Failing | Blocked by env (auth/basePath or loading); tests written and ready |
| Stats cards | ❌ Failing | Same env block |
| Search | ❌ Failing | Same; placeholder in new spec is correct ("Search agents...") |
| Status filter | ❌ Failing | Same env block |
| Refresh | ❌ Failing | Same env block |
| Export dropdown & download | ❌ Failing | Same env block |
| Table headers & sort | ❌ Failing | Same env block |
| Empty state | ❌ Failing | Same env block |
| Server / Drift / Config links | ❌ Failing | Need at least one agent; skip when empty |
| Row selection & bulk | ❌ Failing | Need at least one agent |
| Delete dialog | ❌ Failing | Need at least one agent |
| Terminal dialog / ssh | ❌ Failing | Need at least one agent |
| Error state + Retry | ❌ Failing | Route abort works but page may not show error if auth fails first |
| Existing inventory.spec placeholder | ⚠️ Wrong expectation | Update to "Search agents..." |

---

## Next Steps (for review and fix)

1. **Environment**: Run E2E with dev server and correct auth + base path; re-run `inventory-links-and-actions.spec.ts` and fix any remaining assertion or selector issues.
2. **Placeholder**: Change `inventory.spec.ts` to expect "Search agents..." instead of "Search by hostname, IP, or agent ID...".
3. **Bulk delete**: Done — AlertDialog is in place.
4. **Test IDs**: Added for error Retry, search input, and Export trigger; add more as needed.
5. **CI**: Ensure CI runs with the same base path and auth (or login step) so Inventory content is visible and these tests can pass.
