# Monitoring vs Analytics: Structure and Placement

**Purpose:** Compare options under Monitoring and Analytics and recommend correct placement or moves.

---

## 1. Definitions (for this product)

| Term | Meaning in Avika |
|------|------------------|
| **Monitoring** | Near real-time observation of fleet/instance health: live metrics, short time window (e.g. 1h), auto-refresh. Answers: “Is it up? How is it behaving now?” |
| **Analytics** | Analysis of historical data: trends, breakdowns (by endpoint, status, geography, visitor). Flexible time range, stored data (e.g. ClickHouse). Answers: “What happened? Who? Where? Patterns?” |
| **Dashboard** (/) | At-a-glance summary: agent count, request rate, error rate, latency, traffic history. Entry point, not deep monitoring or deep analytics. |

---

## 2. Current Structure

### 2.1 Sidebar (Operations)

| Item | Route | Notes |
|------|--------|------|
| Dashboard | / | Summary |
| System Health | /system | Infra/platform health |
| **Monitoring** | /monitoring | Live/short-window metrics + Configure |
| **Analytics** | /analytics | Historical analytics + tabs |
| Visitor Analytics | /analytics/visitors | Duplicate entry (also under Analytics) |
| Alerts | /alerts | Alert list (inbox) |
| Reports | /reports | Reports |

### 2.2 Monitoring (/monitoring)

**Data:** `/api/analytics?window=1h` + agent/project filter. Refresh every 5s.

| Tab | Content | Placement |
|-----|---------|-----------|
| Overview | Requests/sec, active connections, error rate, latency; reading/writing/waiting; 2xx/4xx/5xx; request rate chart, connection distribution | ✓ Correct (live metrics) |
| Connections | Connection state breakdown | ✓ Correct |
| Traffic | Traffic metrics/charts | ✓ Correct (short-window traffic) |
| System | System metrics (CPU, memory, etc.) | ✓ Correct |
| **Configure** | NGINX config augmentation (rate limit, health checks, gzip, etc.) – applies provisions to agent | ⚠️ Could live under Management → Provisions; keeping here is OK (contextual to “monitor & tune”) |

### 2.3 Analytics (/analytics)

**Data:** `/api/analytics` with configurable time range; ClickHouse for visitor/geo. No auto-refresh (user-driven).

| Tab / Sub-page | Content | Placement |
|----------------|--------|-----------|
| Overview | KPIs, request rate, status distribution, latency; **links to Visitor Analytics & Geo** | ✓ Correct |
| Gateway | Gateway metrics | ✓ Correct |
| Performance | Performance dashboard | ✓ Correct |
| System | Historical system metrics | ✓ Correct (vs Monitoring = live) |
| Errors | Error analysis | ✓ Correct |
| Visitor Analytics | → /analytics/visitors (browsers, devices, referrers, status codes) | ✓ Correct |
| Geo | → /analytics/geo (traffic by country/city) | ✓ Correct |
| Traffic | Traffic dashboard | ✓ Correct |
| **Alerts** | **AlertConfiguration** (configure alert rules) | ⚠️ Misplaced: rule configuration is operational, not “analytics.” Fits better under **Alerts** (/alerts). |

### 2.4 Alerts (/alerts)

- **Current:** Alert list (active / acknowledged / resolved) – inbox only.
- **Gap:** Alert **rule configuration** lives only under Analytics → Alerts tab. Users managing alerts expect “list + configure” in one place.

---

## 3. Overlap and Distinction

- **Same API, different use:** Both Monitoring and Analytics use `/api/analytics`. Monitoring fixes `window=1h` and refreshes every 5s; Analytics uses a user-selected range and no auto-refresh. So:
  - **Monitoring** = “analytics API in monitoring mode” (short window, live feel).
  - **Analytics** = “analytics API in analysis mode” (flexible range, historical).
- **Traffic / System:** Both have “Traffic” and “System” tabs. Naming is consistent: Monitoring = live, Analytics = historical. No move needed; optional future rename (e.g. “System (live)” vs “System (historical)”) for clarity.

---

## 4. Recommendations

### 4.1 Move: Alert configuration from Analytics to Alerts

- **Current:** Analytics has an “Alerts” tab that renders `AlertConfiguration` (rule config).
- **Recommendation:** Treat **Alerts** as the single place for “alerts” (list + rules). Add a **“Configure rules”** tab (or section) on **/alerts** that embeds `AlertConfiguration`, and **remove the Alerts tab from Analytics**.
- **Result:** Analytics = data/visualization only; Alerts = list + configuration.

### 4.2 Optional: Remove duplicate “Visitor Analytics” from sidebar

- **Current:** Sidebar has both “Analytics” and “Visitor Analytics” (→ /analytics/visitors).
- **Options:**  
  - **A)** Remove “Visitor Analytics” from sidebar; keep only “Analytics.” Users reach visitor view via Analytics → Overview cards or Analytics → Visitor Analytics tab.  
  - **B)** Keep both for prominence and quick access.  
- **Recommendation:** **A** to reduce clutter; **B** if you want one-click access to visitor analytics.

### 4.3 Keep as-is

- **Monitoring:** Overview, Connections, Traffic, System, Configure. All fit “live operations” and optional tuning.
- **Analytics:** Overview, Gateway, Performance, System, Errors, Visitor Analytics, Geo, Traffic. All fit “historical analysis and breakdowns.”
- **Monitoring “Configure” tab:** Can stay (contextual per-agent config) or later be mirrored/linked from Management → Provisions.

---

## 5. Summary Table

| Option | Current location | Recommended location | Action |
|--------|-------------------|----------------------|--------|
| Alert **rules** (AlertConfiguration) | Analytics → Alerts tab | Alerts (/alerts) as “Configure rules” | **Move** |
| Visitor Analytics | Sidebar + Analytics tab + /analytics/visitors | Sidebar: optional remove; Analytics: keep | **Optional** (sidebar duplicate) |
| Everything else under Monitoring | /monitoring | No change | Keep |
| Everything else under Analytics (except Alerts tab) | /analytics | No change | Keep |

---

## 6. Implementation order

1. ~~**Add “Configure rules” (or “Rules”) to /alerts** using `AlertConfiguration`.~~ **Done:** Alerts page has tabs “Inbox” and “Configure rules”; `AlertConfiguration` is in the second tab.
2. ~~**Remove “Alerts” tab from Analytics**~~ **Done:** Analytics no longer has an Alerts tab; alert rule configuration lives only under Alerts.
3. **(Optional)** Remove “Visitor Analytics” from the sidebar and rely on Analytics entry points.
