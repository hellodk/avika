# Inventory Page E2E Test Coverage Report

This report provides a detailed analysis of the E2E test coverage for the Inventory page and its associated components in the Avika AI NGINX Manager.

## 📊 Coverage Summary

| Category | Status | Details |
| :--- | :--- | :--- |
| **Basic Page Structure** | ✅ Implemented | Page load, heading, and layout verified. |
| **Stats Cards** | ⚠️ Partial | Visibility is tested, but logic (correct counts) is not. |
| **Table Display** | ✅ Implemented | Column headers and basic row rendering verified. |
| **Navigation Links** | ✅ Implemented | Links to Server Detail, Drift, and Config from table rows. |
| **Search Functionality** | ⚠️ Partial | Presence of input and typing tested; logic (filtering) is NOT. |
| **Filtering (All/On/Off)** | ⚠️ Partial | Buttons and URL params tested; logic (filtering) is NOT. |
| **Sorting** | ⚠️ Partial | URL params tested; actual row reordering is NOT. |
| **Row Selection** | ✅ Implemented | Checkbox selection and bulk actions bar visibility. |
| **Export (JSON/CSV)** | ✅ Implemented | Triggers downloads and verifies filenames. |
| **Agent Actions (Delete)** | ⚠️ Partial | Dialog visibility tested; actual API call and result NOT. |
| **Agent Actions (Update)** | ❌ Missing | Not tested. |
| **Terminal Access** | ⚠️ Partial | Pod terminal dialog tested; Web Terminal overlay NOT. |
| **Error & Empty States** | ✅ Implemented | Retry button and "No agents found" message verified. |
| **Environment Context** | ❌ Missing | Badge and context-based filtering NOT tested. |

---

## ✅ What is Currently Implemented

### 1. Navigation & Layout
- **Initial Load**: Verified that `/inventory` loads and displays the main heading.
- **Main Structure**: Existence of "Manage your NGINX agent fleet" text.
- **Empty State**: Verified that a "No agents found" message appears when the list is empty.
- **Error State**: Verified that a "Retry" button appears when the `/api/servers` call fails.

### 2. Table Elements & Links
- **Column Headers**: Verified all standard headers (Agent, IP, NGINX, Version, Status, etc.).
- **Row Links**: 
  - Clicking hostname/external link navigates to `/servers/[id]`.
  - Clicking Drift icon navigates to `/servers/[id]?tab=drift`.
  - Clicking Settings icon navigates to `/agents/[id]/config`.

### 3. Inventory Controls
- **Search & Filter Presence**: Input and buttons are visible and interactable.
- **Export**: Clicking "Export as JSON/CSV" triggers a browser download.
- **Refresh**: Refresh button is visible and clickable.

### 4. Row & Bulk Management
- **Selection**: Selecting rows via checkboxes shows the bulk actions bar.
- **Select All**: Toggling the header checkbox selects all filtered rows.
- **Delete Dialog**: Clicking the Delete icon opens the confirmation dialog.
- **Terminal Dialog**: Clicking Terminal on a Kubernetes Pod agent opens the `kubectl exec` dialog.

---

## ❌ What is NOT Implemented / Missing Gaps

### 1. Functional Logic Verification
- **Filtering Logic**: Tests do **not** verify that searching for a specific string actually filters the visible rows to only matches.
- **Status Filtering Logic**: Tests do **not** verify that clicking "Online" or "Offline" correctly hides agents based on their mocked status.
- **Sorting Logic**: Tests do **not** verify that clicking column headers actually reorders the rows in the table.

### 2. Action Execution (API Integration)
- **Delete Execution**: The E2E tests do not confirm the deletion (clicking "Remove" in the dialog, checking for the `DELETE` API call, and verifying the row is gone).
- **Update Action**: No tests exist for triggerring an agent update (single or bulk), verifying the `POST` API call, and checking for success toast messages.
- **Bulk Actions Execution**: No tests exist for the full execution flow of bulk Delete/Update.

### 3. Client UI Interactions
- **Web Terminal Overlay**: While the dialog for pods is tested, clicking the "Web Terminal" button within that dialog and verifying the `TerminalOverlay` component appears is NOT tested.
- **SSH Redirect**: No test exists for the SSH redirect triggered when clicking Terminal on a non-pod (bare metal/VM) agent.
- **Copy Agent ID**: The "click to copy" functionality for agent IDs is NOT tested.
- **Auto-Refresh**: The 15-second auto-refresh interval is NOT verified.

### 4. Data-Dependent UI States
- **Status Badges**: Verifying that the correct color-coded status badge (Online/Stale/Offline) appears based on the `last_seen` timestamp.
- **Update Badges**: Verifying that the "Update" badge appears next to the version only when the agent version is behind the `latestVersion`.
- **Project/Environment Context**: Verifying that the page correctly displays the context badge and filters agents when a specific project/environment is selected in the global context.

---

## 🚀 Recommendations

1. **Enhance Mocking**: Add E2E tests with multiple mock agents (at least 3-5 with varied statuses/names) to properly test filtering and sorting.
2. **Close the Loop**: Implement tests for the **confirm** action in Delete/Update dialogs to ensure the backend integration is working.
3. **Verify Terminal Overlay**: Add a test step to click "Web Terminal" and verify the terminal component loads.
4. **Context Testing**: Add a test case that sets a project/environment context and verifies the inventory responds correctly.
