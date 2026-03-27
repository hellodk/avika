# Avika AI NGINX Manager - Full E2E Test Coverage Report

This report evaluates the current state of End-to-End (E2E) testing across all major pages and components of the Avika application.

## 📈 Global Coverage Overview

| Page / Feature | Status | Primary Spec File | Coverage Notes |
| :--- | :--- | :--- | :--- |
| **Dashboard** | ✅ High | `dashboard.spec.ts` | KPI cards, Charts, Time range, Refresh. |
| **Monitoring** | ✅ High | `monitoring.spec.ts` | All tabs (Overview, Traffic, etc.), API metrics. |
| **Inventory** | ⚠️ Medium | `inventory.spec.ts` | Row links, structure. Gaps: Filtering, Sorting, Actions logic. |
| **Alerts** | ⚠️ Low | `alerts.spec.ts` | Page load only. Gaps: Rule creation, Listing, Config. |
| **Analytics** | ⚠️ Low | `analytics.spec.ts` | Tab persistence. Gaps: Drilldowns, Data filters. |
| **Provisions** | ⚠️ Low | `provisions.spec.ts` | Page load only. Gaps: Template selection, Execution. |
| **Settings** | ⚠️ Low | `settings.spec.ts` | Theme toggle only. Gaps: User prefs, Backups, Secrets. |
| **Reports** | ⚠️ Medium | `authenticated-pages.spec.ts` | Page load, PDF download. Gaps: CSV/Excel, Custom ranges. |
| **AI Tuner** | ⚠️ Low | `authenticated-pages.spec.ts` | Page load only. Gaps: Optimization logic, History. |
| **System** | ⚠️ Low | `authenticated-pages.spec.ts` | Page load only. Gaps: Service health checks, Logs. |
| **Traces** | ⚠️ Low | `authenticated-pages.spec.ts` | Page load only. Gaps: Trace viewer, Span details. |
| **Visitors** | ✅ High | `visitor-and-search.spec.ts` | Page load, Header search integration. |
| **WAF** | ❌ None | N/A | baseline navigation only. |
| **Geo** | ❌ None | N/A | baseline navigation only. |
| **Drift** | ✅ High | `drift.spec.ts` | Baseline coverage for drift detection. |

---

## 🔍 Key Findings & Gaps

### 1. Functional Logic (The "Interactive" Layer)
Most pages have "smoke tests" (checking if headings and main containers load) but lack functional verification of the business logic:
- **Filtering & Search**: Many pages (Inventory, Analytics, Audit) have search inputs that aren't verified to actually filter data.
- **Sorting**: Table sorting is mostly untested for actual row order.
- **Form Submission**: Rule creation (Alerts) and provision triggers (Provisions) are mostly untested.

### 2. Component-Level Gaps
- **Terminal Access**: While pod terminal dialogs are checked, the actual `TerminalOverlay` content (Xterm.js integration) and SSH redirects for bare-metal agents are not verified.
- **Bulk Actions**: Bulk selection and execution (Delete/Update) are not fully realized in tests.
- **Empty & Error States**: While Inventory has good coverage here, other pages rarely check how they handle API failures or empty data returned from ClickHouse/PostgreSQL.

### 3. Missing Integration Tests
- **Context Synchronization**: Selecting a Project/Environment in the global sidebar should reflect in all pages (Filtering data). This is currently only partially tested in Monitoring.
- **Authentication Lifecycle**: Basic login

---

## ✅ Newly Implemented Tests

### 1. Dashboard
- [x] Page load & Sidebar rendering
- [x] Basic metrics display (mocked)
- [x] Project/Environment selector (mocked)

---

### 2. Inventory
- [x] List rendering & search
- [x] Functional sorting (Hostname, Status)
- [x] Environment filtering
- [x] Agent deletion flow verification

---

### 3. Alerts
- [x] Inbox / Config tab switching
- [x] Alert rule creation wizard (mocked flow)
- [x] Alert deletion logic

---

### 4. Provisions
- [x] Provisioning Wizard visibility
- [x] Rate Limiting wizard flow (Multi-step verification)
- [x] Configuration preview & applying

---

### 5. System Health
- [x] Infrastructure health status badges
- [x] Component status verification (Healthy/Degraded states)
- [x] Agent fleet status overview

---

### 6. Settings
- [x] Integration configuration persistence (Grafana/URL)
- [x] Appearance/Theme switching logic
- [x] Display & Telemetry settings validation

---

## 🚀 Priority Action Items

1. **Alerts Page (Critical)**: Implement tests for creating a new alert rule and verifying it appears in the list.
2. **Provisions Page**: Implement tests for selecting a "Rate Limiting" template and clicking Provision.
3. **Inventory Page**: Finalize functional logic tests for filtering and sorting as identified in the previous inventory report.
4. **Settings Page**: Expand scope to cover actual configuration persistence beyond theme.
5. **System Page**: Verify health checks for Gateway, ClickHouse, and Postgres components.
