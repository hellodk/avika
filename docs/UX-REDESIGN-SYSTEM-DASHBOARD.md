# System Dashboard UX Redesign Plan

**Audience:** DevOps / SRE  
**Page:** System (infrastructure & agent fleet) — *referred to as "Settings" in some contexts; redesign targets the observability dashboard that shows agents, uptime, and infrastructure health.*  
**Goal:** Scanability in <3 seconds, clear operational state, minimal visual noise, progressive disclosure of detail.

---

## 1. Executive Summary

The current System page presents the right data but with weak information architecture and heavy visual hierarchy. For an observability/infra dashboard, the primary question should be answered immediately: **Is the system healthy?** This document proposes a production-grade layout (Grafana/Datadog/Vercel-inspired) and lists concrete observations for Architects, Developers, and SREs to implement or triage.

---

## 2. Design Principles Applied

| Principle | Current Issue | Target |
|-----------|---------------|--------|
| **Scanability** | Four large top cards + card-based infrastructure + dense table | One-line system overview; status-dense rows; thin tables |
| **Operational state first** | Health buried below summary cards | Infrastructure health at top; big status indicators |
| **Visual noise** | Many bordered cards, badges, icons per row | Soft grouping; dividers; fewer icons |
| **Progressive disclosure** | Everything visible at once | Summary → Infrastructure → Fleet; hover for actions |

---

## 3. Proposed Layout (High-Level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SYSTEM HEALTH                                                            │
│ Agents 8/8    Uptime 100%    Version v1.7.0                    [Refresh] │
├──────────────────────────────────┬──────────────────────────────────────┤
│ INFRASTRUCTURE                    │ AGENT FLEET                           │
│ API Gateway      ● Healthy       │ Agent            Status    Ver   Seen │
│ PostgreSQL       ● Healthy       │ ─────────────────────────────────────│
│ ClickHouse       ● Healthy       │ ⎈ nginx-alpha    ● Online  1.7  2s   │
│ Agent Network    ● 8 nodes       │ ⎈ nginx-beta     ● Online  1.7  1s   │
│                                  │ 🖥 nginx-edge    ⚠ Update  0.19 3s   │
│ (optional) TRAFFIC               │                                      │
│ Requests/s  284  Err 0.03%  p95 18ms                                   │
├──────────────────────────────────┴──────────────────────────────────────┤
│ RECENT EVENTS (optional)                                                 │
│ 12:41  nginx-beta connected    12:38  nginx-sidecar update available   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Specific Redesign Items

### 4.1 Reduce Top Card Noise (P0)

**Current:** Four full-width cards: Total Agents, Active Agents, Fleet Uptime, System Version.  
**Proposed:** Single “System Overview” strip with inline metric chips (no card borders).

- **Layout:** One row: `Agents 8/8` | `Uptime 100%` | `Version v1.7.0`
- **Pattern reference:** Datadog / Linear / Vercel top metrics
- **Implementation note:** Replace the 4-card grid with a single `<section>` and flex/grid of metric labels + values (large numbers, smaller labels).

### 4.2 Promote Infrastructure Health to the Top (P0)

**Current:** “Infrastructure Components” is below the summary cards; each component is a sub-card with icon, badge, description, version, latency.  
**Proposed:** Infrastructure first (or immediately after one-line system overview). Status as simple rows with a single status indicator.

- **Layout:** Section title “Infrastructure” (no “Components” / no long description). Rows: `Component name` + status dot + label (e.g. “● Healthy”).
- **Optional:** Add latency/version as secondary text on the same line (e.g. “21ms”, “v1.7.0”) to avoid extra cards.
- **Implementation:** Remove per-component cards; use a simple list or table-like rows with soft dividers.

### 4.3 Two-Column Layout (P1)

**Current:** Single column, long vertical scroll.  
**Proposed:** Two columns on large viewports: left = system/infrastructure, right = agent fleet.

- **Left column:** System overview line + Infrastructure list (+ optional micro metrics).
- **Right column:** Agent fleet table (and optional recent events below).
- **Benefit:** “System vs nodes” mental model; less scrolling; matches SRE expectations.

### 4.4 Simplify the Agent Table (P0)

**Current:** Columns Agent (with icon + hostname + truncated ID), Type (Kubernetes/VM badge), Version (with “Update available” badge), Status (badge), Last Seen, Actions (buttons).  
**Proposed:**

- **Columns:** Agent | Status | Version | Last Seen (drop explicit “Type” column by encoding type in agent name with icon).
- **Agent column:** Icon (⎈ Pod / 🖥 VM) + hostname only; no truncated ID in default view; optional tooltip or second line for ID.
- **Status:** Most visible element — larger semantic indicator (● ONLINE / ● DEGRADED / ● OFFLINE) with clear color (green / yellow / red / gray).
- **Remove:** Heavy Kubernetes/VM badge as a separate column; redundant icon next to agent; always-visible action buttons.
- **Actions:** Hover or row actions (e.g. “Open”, “Restart”, “Logs”, “Update” when applicable).

### 4.5 Status as the Most Visible Element (P0)

**Current:** Small green/red badges, low contrast.  
**Proposed:**

- Larger status indicator (dot + short label): e.g. “● ONLINE”, “● DEGRADED”, “● OFFLINE”.
- Consistent semantics: green = healthy, yellow = degraded, red = down, gray = unknown.
- Same treatment for infrastructure rows and agent rows.

### 4.6 Remove Card Borders / Use Soft Grouping (P1)

**Current:** Multiple Card components with borders around summary, infrastructure, and fleet.  
**Proposed:**

- Section titles with a subtle divider (or background) only; no heavy card borders.
- “Section title + content” pattern; content can be list or table with minimal framing.
- Reduces rectangles and visual clutter.

### 4.7 Micro Metrics (P2)

**Current:** No live traffic/activity metrics on this page.  
**Proposed (optional):** Small “Traffic” or “Activity” block: Requests/s, Error rate, Latency p95 (from gateway or existing stats API). Keeps the dashboard “living” without adding big cards.

### 4.8 Activity Stream (P2)

**Current:** Page feels static.  
**Proposed (optional):** “Recent events” strip: e.g. “12:41 nginx-beta connected”, “12:38 nginx-sidecar update available”. Improves operational context; can be collapsed by default on small screens.

### 4.9 Visual Hierarchy (P1)

**Current:** Similar font weights/sizes everywhere.  
**Proposed:**

- **Page title:** ~20px, bold.
- **Section titles:** ~16px, semibold.
- **Metric value (big number):** ~28px (or 24px) for “8/8”, “100%”, “v1.7.0”.
- **Body/labels:** 14px, regular.
- Ensures “big numbers” for key metrics and clear sectioning.

### 4.10 Remove Redundant Labels (P1)

**Current:** e.g. “Infrastructure Components” + “Core system services and their current status”.  
**Proposed:** Single section title: “Infrastructure”. Same for “Agent Fleet” — drop long description or keep one short line if needed.

### 4.11 Kubernetes / VM Distinction (P1)

**Current:** “Type” column with badge (Kubernetes / VM).  
**Proposed (choose one):**

- **Option A (recommended):** Icon + label in Agent column: “⎈ nginx-alpha-dev”, “🖥 nginx-edge”. Legend: ⎈ = Pod, 🖥 = VM.
- **Option B:** Subtext under hostname: “k8s / pod / eu-west-1” vs “vm / aws / us-east-1”.
- **Option C:** Small muted pill next to name: [K8S] / [VM] with subtle color.

---

## 5. Observations for Architect / Developer / SRE

These are actionable notes for implementation and product decisions.

### 5.1 Architecture / Data

| # | Observation | Owner | Notes |
|---|-------------|--------|--------|
| A1 | **Health and stats endpoints:** System page uses `/api/servers`, `/api/health`, `/api/ready`, `/api/stats`. Ensure a single “system overview” or “dashboard summary” API is not required for the new layout; current endpoints can still back the one-line metrics and infrastructure list. | Backend | If a dedicated “system summary” API is added later, it can return { agents_online, total, uptime_pct, version, components[] } to reduce client round-trips. |
| A2 | **Real-time / polling:** Page polls every 10s. Consider WebSocket or SSE for “living” metrics and recent events to avoid stale data and improve “activity stream” UX. | Backend / Frontend | Optional; not blocking for layout redesign. |
| A3 | **Agent “type” (Pod vs VM):** `agent.is_pod` is used for the Type column. Preserve this in API responses so the new Agent column (with icon) can display correctly. | Backend | No change required if field already exists. |

### 5.2 Frontend / UI

| # | Observation | Owner | Notes |
|---|-------------|--------|--------|
| F1 | **Replace 4-card grid** with one “System Overview” row (metrics only, no Card wrapper). | Frontend | Reuse or extend design tokens for “metric value” (e.g. 28px) and “metric label” (14px, muted). |
| F2 | **Infrastructure block:** Refactor from 4 child cards to a single list/rows. Use status dot + label; optionally show version/latency inline. | Frontend | Reuse existing health data; change only presentation. |
| F3 | **Two-column layout:** Use CSS Grid or Flex; left column ~40% (or min-width), right column 60% on lg breakpoint; stack on small screens. | Frontend | Ensure sidebar/nav does not break; test with project layout. |
| F4 | **Agent table:** Reduce columns; merge Type into Agent (icon); make Status column prominent; replace always-visible action buttons with hover menu or icon button that reveals “Open / Restart / Logs / Update”. | Frontend | Accessibility: ensure hover actions are keyboard and screen-reader friendly (e.g. dropdown with focus trap). |
| F5 | **Status semantics:** Centralize status → color/label/icon in a small util (e.g. `getStatusDisplay(status)`) and use for both infrastructure and agents. | Frontend | Keeps “Online/Degraded/Offline/Unknown” consistent. |
| F6 | **Card removal:** Audit System page for all `<Card>` usages; replace with `<section>` + title + divider or light background where appropriate. | Frontend | Align with design system: consider a “Section” or “Block” component without border. |
| F7 | **Micro metrics / Activity stream:** If implemented, need data source (e.g. `/api/stats` extended, or new endpoint). Frontend can reserve space and wire later. | Frontend / Backend | P2; can be placeholder or “Coming soon”. |

### 5.3 SRE / Operations

| # | Observation | Owner | Notes |
|---|-------------|--------|--------|
| S1 | **“Is the system healthy?” in <3s:** After redesign, validate with 2–3 SREs that the top of the page (system overview + infrastructure) answers this without scrolling. | SRE / Product | Acceptance criterion for P0. |
| S2 | **Error state:** When health or agents fail to load, ensure error message is visible near the top (not buried below empty cards). | Frontend | Keep existing error alert; place it under the header / system overview. |
| S3 | **Refresh:** Single “Refresh” control is sufficient; keep it in the system overview row. | Frontend | No change to behavior. |
| S4 | **Agent actions:** Update / Restart / Logs must remain available (e.g. via hover or row menu) so SRE workflows are not broken. | Frontend | Ensure “Update” is discoverable when an agent has an update available. |

### 5.4 Accessibility & QA

| # | Observation | Owner | Notes |
|---|-------------|--------|--------|
| Q1 | **Status indicators:** Use `aria-label` and/or `role="status"` for “Healthy”, “Online”, “Degraded”, etc., and ensure color is not the only differentiator. | Frontend | Already partially done; extend to new status components. |
| Q2 | **Hover actions:** When replacing action buttons with hover menu, ensure focus states and keyboard navigation (Enter/Space to open menu, arrows to move, Escape to close). | Frontend | Required for WCAG 2.1. |
| Q3 | **Tables:** Agent table must remain a proper `<table>` (or equivalent with correct roles) for screen readers. | Frontend | Do not replace with divs only. |

---

## 6. Implementation Checklist (Suggested Order)

- [ ] **P0 – Top metrics:** Replace 4 summary cards with one “System Overview” row (Agents, Uptime, Version).
- [ ] **P0 – Infrastructure first:** Move infrastructure above or beside fleet; render as status rows (no sub-cards).
- [ ] **P0 – Agent table:** Simplify columns (Agent with icon, Status, Version, Last Seen); make status prominent; remove Type column (encode in icon).
- [ ] **P0 – Status visibility:** Implement consistent status component (dot + label, green/yellow/red/gray).
- [ ] **P1 – Two-column layout:** Left = system + infrastructure; right = agent fleet; responsive stack.
- [ ] **P1 – Soft grouping:** Remove card borders; use section titles + dividers/background only.
- [ ] **P1 – Redundant copy:** Remove duplicate titles/descriptions (e.g. “Infrastructure” only).
- [ ] **P1 – Typography:** Apply hierarchy (20px title, 16px section, 28px metric, 14px body).
- [ ] **P2 – Hover actions:** Replace always-visible action buttons with row hover menu (Open, Restart, Logs, Update).
- [ ] **P2 – Micro metrics:** Add Traffic/Activity block if backend supports (req/s, error rate, p95).
- [ ] **P2 – Activity stream:** Add “Recent events” if backend/API supports.

---

## 7. Inspiration References

- **Grafana:** Metrics-first top row; panels with minimal borders; high signal density.
- **Datadog:** Status-dense rows; no big cards; clear operational signal per service.
- **Vercel / Linear:** Few borders; typography hierarchy; soft separators.
- **Kubernetes Dashboard:** Node list with type icons (e.g. pod vs node); compact table.

---

## 8. Sample UI

A **preview route** is provided at **`/system/preview`** in the app. It implements the proposed layout with mock data so you can:

- Compare current **`/system`** vs proposed **`/system/preview`**.
- Validate scanability, hierarchy, and two-column layout before committing to full implementation.
- Share with stakeholders for approval.

After review, either:

1. Replace the current System page with the new layout (and remove or repurpose `/system/preview`), or  
2. Iterate on the preview and then merge the design into the main System page.

---

## 9. Settings Page (Clarification)

This plan targets the **System** page (infrastructure + agent fleet). The **Settings** page (user preferences, integrations, LLM, WAF, etc.) is a different route. If you want similar “production-grade” treatment for Settings (e.g. less card noise, clearer sections), the same principles (soft grouping, clear hierarchy, reduced redundancy) can be applied there in a follow-up pass.
