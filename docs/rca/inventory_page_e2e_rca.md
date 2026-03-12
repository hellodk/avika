# Inventory Page E2E Test and RCA

## Status: Fixes Applied

- **Observations 1 & 2 (N/A columns / Needs Update):** Mock agent data in `api/servers/route.ts` and client `api.ts` was enriched with `ip`, `version`, `agent_version`, and `last_seen` so the table and stats show real values instead of N/A.
- **Observation 3 (Sticky loading):** `handleBulkUpdate` and `handleBulkDeleteConfirm` now call `setLoading(false)` in a `finally` block.
- **Observation 4 (Deletion/await):** `handleBulkDeleteConfirm` now `await fetchAgents()` and uses `finally`; bulk delete/update use `Promise.all()` for concurrent requests. *Note:* With `NEXT_PUBLIC_MOCK_BACKEND=true`, the DELETE route still calls gRPC (no mock branch), so delete may 500 and the list will not change until a real backend is used.
- **Observation 5 (Search vs header):** Header cards (Total Agents, Online, Offline, Needs Update) are now computed from the fleet with project/env and status filter only—**not** from the search filter—so they no longer change when typing in the search box.
- **Suspense/skeleton:** Dead Suspense was removed; skeleton is shown on initial load when `loading && instances.length === 0`.

---

## E2E Test Observations

During the end-to-end testing of the Inventory page (`http://127.0.0.1:3000/avika/inventory`), several bugs and user experience issues were identified.

### 1. Missing Agent Data (UI Issue)
- **Observation:** Most data columns in the inventory table, including **IP Address**, **NGINX**, **Version**, and **Last Seen**, display **"N/A"** for the mock agent.
- **Impact:** Users are unable to see vital information about their instances.
- **Screenshot:**
![Missing Data](/home/dk/.gemini/antigravity/brain/dd52cb9d-f8ea-4281-a8bb-26f690ed2efd/.system_generated/click_feedback/click_feedback_1773329969925.png)

### 2. Inconsistent Fleet Stats
- **Observation:** The **"Needs Update"** header card shows `1` agent requiring an update, but the corresponding agent row shows "N/A" for the version.
- **Impact:** It's confusing to the user why an agent is flagged for an update when no version data is displayed.

### 3. Sticky Loading State (Functional Bug)
- **Observation:** When triggering a bulk "Update", the UI enters a persistent "Refreshing..." state. The table clears and remains empty. It only recovers because a background interval automatically refreshes the data every 15 seconds.
- **Impact:** The application appears to hang or crash after performing actions, providing a very poor user experience.

### 4. Deletion Failure (Critical Functional Bug)
- **Observation:** Attempting to delete an agent via either the bulk action or the individual trash icon fails to remove the agent from the view. While the confirmation modal appears and the "Refreshing" state triggers, the agent (`web-01.local`) remains in the list after the refresh completes.
- **Impact:** Users cannot manage their inventory by removing retired or decommissioned agents.

### 5. Confusing Search/Header UX
- **Observation:** Typing in the search bar incorrectly filters the counts in the global Header Cards (Total Agents, Online, etc.).
- **Impact:** Header cards typically represent global fleet health metrics and shouldn't fluctuate based on local table searches.

---

## Root Cause Analysis (RCA)

Based on the code analysis previously performed and corroborated by the E2E test:

1. **Bug: Data Mapping Issues (Observations 1 & 2)**
   - **Root Cause:** In [frontend/src/app/api/servers/route.ts](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/api/servers/route.ts), the mock backend returns an agent object without the explicit fields `ip`, `version`, `nginx_version`, etc. Furthermore, the gRPC mapper in [route.ts](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/api/servers/route.ts) is likely mapping snake_case/camelCase incorrectly between the backend and frontend models for the real data as well.

2. **Bug: Missing State Resets (Observation 3)**
   - **Root Cause:** In [page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/page.tsx), the [handleBulkUpdate](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/inventory/page.tsx#172-199) and [handleBulkDeleteConfirm](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/inventory/page.tsx#143-171) functions call `setLoading(true)` but **fail to call `setLoading(false)`** inside a `finally` block when the API requests complete. The UI is only rescued by the periodic `setInterval` poll that later calls `setLoading(false)`.

3. **Bug: Race Conditions & Missing Awaits (Observation 4)**
   - **Root Cause:** In [handleBulkDeleteConfirm](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/inventory/page.tsx#143-171) (line 153 of [page.tsx](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/page.tsx)), the code calls `fetchAgents();` synchronously at the very end **without an `await`**. This causes the frontend to re-fetch the list immediately without waiting for the deletion to fully propagate or the state to update properly.
   - **Root Cause (Mock Data):** The mock `DELETE` endpoint in `/api/servers/[id]/route.ts` likely does not mutate the static array returned by [GET](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/api/servers/route.ts#7-59), so the agent always reappears.

4. **Performance Bottleneck**
   - **Root Cause:** Bulk actions are implemented using a serial `for...of` loop with `await` on each individual network request instead of concurrent `Promise.all()`. This `N+1` database/API anti-pattern causes significant latency during multi-agent operations.

5. **React Anti-Patterns**
   - **Root Cause:** The [InventoryPageSkeleton](file:///home/dk/Documents/git/nginx-manager-cursor/frontend/src/app/inventory/page.tsx#371-400) is wrapped in a `<Suspense>` boundary around a Client Component that uses `useEffect` for data fetching. It will never actually trigger the Suspense boundary, rendering it dead code.

---

### E2E Test Recording
![E2E Video Recording](/home/dk/.gemini/antigravity/brain/dd52cb9d-f8ea-4281-a8bb-26f690ed2efd/inventory_e2e_test_1773329798951.webp)
