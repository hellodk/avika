# Analytics Dashboard Issues - Comprehensive Analysis

**Date:** March 1, 2026  
**Analyst:** QA/Testing Review  
**Status:** ✅ RESOLVED

## Summary of Fixes Applied (2026-03-01)

| Issue | Status | Fix Description |
|-------|--------|-----------------|
| Absolute time range | ✅ Fixed | Backend now handles `from_timestamp`/`to_timestamp` in ClickHouse queries |
| Browser timezone conversion | ✅ Fixed | Frontend converts all formats (HH:MM, MM-DD HH:MM, YYYY-MM-DD HH:MM) |
| Live dashboard alignment | ✅ Fixed | Live dashboards use UTC timestamps consistently |
| Timezone indicator | ✅ Fixed | Charts display current timezone (UTC or browser TZ) |
| Date context | ✅ Fixed | Multi-day ranges include date in x-axis labels |
| Gateway metrics | ✅ Fixed | Shown regardless of agent filter |
| Traffic field | ✅ Fixed | Top endpoints show actual byte counts |
| Delta labels | ✅ Fixed | Show specific comparison period (e.g., "vs yesterday")

---

## Original Analysis (for reference)

---

## Executive Summary

This document catalogs all identified issues with the Avika Analytics dashboard, focusing on time/timezone handling, data display inconsistencies, and general UX problems. Issues are categorized by severity and area.

---

## 1. CRITICAL: Timezone Handling Issues

### Issue 1.1: Incomplete Browser Timezone Conversion
**Location:** `frontend/src/app/analytics/page.tsx` (lines 272-283)

**Problem:** The `formatTimeForDisplay()` function only handles the `HH:MM` format. With the recent dynamic time formatting changes, the backend now returns formats like `%m-%d %H:00` for multi-day ranges and `%Y-%m-%d` for 30-day ranges. These formats are NOT converted when "Browser" timezone is selected.

```typescript
const formatTimeForDisplay = (timeStr: string) => {
    if (!timeStr) return timeStr;
    if (timezone === 'Browser') {
        // BUG: Only handles HH:MM format
        if (timeStr.match(/^\d{2}:\d{2}$/)) {
            // ... conversion logic
        }
    }
    return timeStr; // Multi-day formats returned unchanged!
};
```

**Impact:** When user selects "Browser" timezone and a time range > 24 hours, the chart shows UTC times without conversion.

**Severity:** HIGH

---

### Issue 1.2: No Timezone Indicator on Charts
**Location:** All chart components

**Problem:** Charts display times without any indication of whether they're in UTC or local browser time. Users have no visual cue which timezone they're viewing.

**Recommendation:** Add a small badge or subtitle to charts showing "Times in UTC" or "Times in Local" based on the toggle state.

**Severity:** MEDIUM

---

### Issue 1.3: Live vs Historical Timezone Mismatch
**Location:** 
- `frontend/src/components/analytics/dashboards/TrafficDashboard.tsx` (line 31)
- `frontend/src/components/analytics/dashboards/SystemDashboard.tsx` (line 32)
- `frontend/src/components/analytics/dashboards/NginxCoreDashboard.tsx` (line 29)

**Problem:** Live dashboards use `new Date().toLocaleTimeString()` for time labels (browser local time), while historical data from ClickHouse uses UTC-formatted times. This creates inconsistency when switching between Live and Historical modes.

```typescript
// Live mode - uses browser local time
time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Historical mode - uses UTC from backend
time: formatTimeForDisplay(p.time)  // This is UTC!
```

**Impact:** Charts appear to have different time bases depending on mode.

**Severity:** HIGH

---

## 2. HIGH: Time Range Display Issues

### Issue 2.1: Missing Date Context for Short Ranges
**Location:** `cmd/gateway/clickhouse.go` (lines 443-458)

**Problem:** For time ranges ≤ 24 hours, the backend only returns `HH:MM` format without any date information. If a user queries "Last 24 hours" at 2:00 AM, they'll see times like "03:00, 04:00, ..." without knowing those are from yesterday.

**Example Scenario:**
- Current time: March 1, 02:15 AM
- Selected range: "Last 24 hours"
- Data point at "03:00" could be from March 1 OR February 28
- No way for user to distinguish

**Recommendation:** Consider always including date for spans > 12 hours, or add a date header/separator in charts.

**Severity:** MEDIUM

---

### Issue 2.2: X-Axis Crowding on Long Ranges
**Location:** All time-series charts

**Problem:** For 7-day or 30-day ranges, hourly or daily data points create many x-axis labels that overlap and become unreadable.

**Recommendation:** 
- Implement tick interval selection based on data point count
- Use Recharts' `tickFormatter` and `interval` props

**Severity:** LOW

---

### Issue 2.3: No Indication of Data Gaps
**Location:** All time-series charts

**Problem:** If there's no data for certain time periods (e.g., server was down), the charts simply skip those points with no visual indication of the gap.

**Recommendation:** Consider using `connectNulls={false}` in Recharts and inserting null points for missing time buckets.

**Severity:** LOW

---

## 3. HIGH: Absolute Time Range Not Working

### Issue 3.1: Absolute Time Range Parameters Ignored
**Location:** `cmd/gateway/clickhouse.go` (line 406)

**Problem:** The `GetAnalytics` function only uses the `window` parameter to calculate the time range. The `from_timestamp` and `to_timestamp` fields from the protobuf request are completely ignored.

```go
func (db *ClickHouseDB) GetAnalytics(ctx context.Context, window string, agentID string) (*pb.AnalyticsResponse, error) {
    // window parameter is used
    duration := 24 * time.Hour
    switch window {
    // ...
    }
    startTime := time.Now().UTC().Add(-duration)  // Always calculates from NOW
    // from_timestamp and to_timestamp are never used!
}
```

**Impact:** Users cannot query historical data for specific date ranges. The "Absolute time" picker in the frontend is effectively non-functional for custom date ranges.

**Evidence in Frontend:**
```typescript
// frontend/src/app/api/analytics/route.ts (lines 22-29)
if (fromTimestamp && toTimestamp) {
    analyticsRequest.from_timestamp = parseInt(fromTimestamp);
    analyticsRequest.to_timestamp = parseInt(toTimestamp);
} else {
    analyticsRequest.time_window = timeWindow;
}
```

The frontend sends the timestamps, but the backend ignores them.

**Severity:** CRITICAL

---

## 4. MEDIUM: Data Display Inconsistencies

### Issue 4.1: Vague Delta Labels
**Location:** `frontend/src/app/analytics/page.tsx` (lines 536-567)

**Problem:** KPI cards show deltas like "+100 from prev period" but don't specify what "prev period" means. For "Last 24 hours", prev period is the 24 hours before that, but this isn't clear.

**Recommendation:** Show specific labels like "vs yesterday" or "vs previous 24h".

**Severity:** LOW

---

### Issue 4.2: Server Distribution Shows Instance IDs
**Location:** `cmd/gateway/clickhouse.go` (lines 693-725)

**Problem:** Server distribution uses `instance_id` which might be a UUID or agent ID, not a human-readable hostname.

```go
resp.ServerDistribution = append(resp.ServerDistribution, &pb.ServerStat{
    Hostname:  id,  // This is instance_id, might be UUID
    // ...
})
```

**Recommendation:** Join with agent metadata to get actual hostname, or ensure agents register with hostname.

**Severity:** LOW

---

### Issue 4.3: Status Code 0 Filtered Without Explanation
**Location:** `cmd/gateway/clickhouse.go` (lines 500-514, 611-616)

**Problem:** Requests with `status = 0` are silently filtered out. These could be:
- Requests that never completed
- Connection drops
- Internal errors

Users are not informed that some data is excluded.

**Recommendation:** Either show these in a separate "Incomplete Requests" category or add a note about data exclusions.

**Severity:** LOW

---

## 5. MEDIUM: Gateway Tab Issues

### Issue 5.1: Gateway Metrics Hidden with Agent Filter
**Location:** `cmd/gateway/clickhouse.go` (lines 957-993)

**Problem:** Gateway metrics (EPS, connections, memory, DB latency) are only fetched when no specific agent is selected (`agentID == "" || agentID == "all"`).

**Impact:** Users cannot see gateway performance when filtering by a specific agent, which might be confusing since gateway metrics are independent of individual agents.

**Recommendation:** Gateway metrics should always be shown in the Gateway tab regardless of agent filter.

**Severity:** MEDIUM

---

## 6. LOW: Chart/UI Improvements Needed

### Issue 6.1: No Loading State for Charts
**Location:** Most chart components

**Problem:** Individual charts don't show loading spinners when data is being fetched. Only the main page has a loading indicator.

**Severity:** LOW

---

### Issue 6.2: Tooltip Inconsistencies
**Location:** Various chart tooltips

**Problem:** Some tooltips show raw numbers without formatting (e.g., "1234567" instead of "1.23M").

**Severity:** LOW

---

### Issue 6.3: Trend Arrows May Be Confusing
**Location:** `frontend/src/app/analytics/page.tsx` (lines 541, 549, 559)

**Problem:** For some metrics, "up" is good (requests) but for others "up" is bad (latency, error rate). The color coding is correct, but the arrows might confuse users.

```typescript
// For latency - lower is better, but we show "up" arrow for negative delta
trend={summary.latency_delta <= 0 ? "up" : "down"}
```

**Severity:** LOW

---

## 7. DATA INTEGRITY: Time Bucketing Edge Cases

### Issue 7.1: Data Appears "Behind" Current Time
**Location:** Backend ClickHouse queries using `toStartOf*` functions

**Problem:** Time series data is bucketed to the START of the period. At 14:37, hourly data shows "14:00" as the latest point, making it appear 37 minutes behind.

**User Perception:** "Why doesn't the chart show data up to now?"

**Recommendation:** Add explanation text or use bucket END time instead of START time.

**Severity:** LOW

---

## 8. POTENTIAL DATA ISSUES

### Issue 8.1: NaN Values in Percentiles
**Location:** `cmd/gateway/clickhouse.go` (lines 582-590, 650-655)

**Problem:** The code checks for NaN values in quantile results, which suggests ClickHouse may return NaN for empty buckets. While handled, this could indicate data quality issues.

**Severity:** INFO

---

### Issue 8.2: Traffic Field Shows "0 KB"
**Location:** `cmd/gateway/clickhouse.go` (lines 556)

**Problem:** Top Endpoints query doesn't include `body_bytes_sent` aggregation, hardcoding traffic as "0 KB".

```go
resp.TopEndpoints = append(resp.TopEndpoints, &pb.EndpointStat{
    // ...
    Traffic:  "0 KB", // Not tracking bytes yet in this query
})
```

**Severity:** LOW

---

## Recommended Priority Order

1. **CRITICAL** - Fix absolute time range handling (Issue 3.1)
2. **HIGH** - Fix browser timezone conversion for all formats (Issue 1.1)
3. **HIGH** - Fix live vs historical timezone mismatch (Issue 1.3)
4. **MEDIUM** - Add timezone indicator to charts (Issue 1.2)
5. **MEDIUM** - Show gateway metrics regardless of agent filter (Issue 5.1)
6. **MEDIUM** - Add date context for short ranges spanning midnight (Issue 2.1)
7. **LOW** - Remaining UX improvements

---

## Files Affected

| File | Issues |
|------|--------|
| `cmd/gateway/clickhouse.go` | 3.1, 4.2, 4.3, 5.1, 7.1, 8.1, 8.2 |
| `frontend/src/app/analytics/page.tsx` | 1.1, 1.2, 4.1, 6.3 |
| `frontend/src/components/analytics/dashboards/TrafficDashboard.tsx` | 1.3 |
| `frontend/src/components/analytics/dashboards/SystemDashboard.tsx` | 1.3 |
| `frontend/src/components/analytics/dashboards/NginxCoreDashboard.tsx` | 1.3 |
| `frontend/src/app/api/analytics/route.ts` | 3.1 (caller) |

---

## Appendix: Test Scenarios

### Timezone Testing
1. Set browser timezone to UTC+0, select "Last 3 hours", verify times match
2. Set browser timezone to UTC+5:30, select "Last 3 hours", toggle to "Browser" timezone
3. Select "Last 7 days" with browser timezone - verify date formats convert correctly

### Absolute Time Range Testing
1. Select "Yesterday" from absolute ranges - should show yesterday's data
2. Use custom date picker for a specific past date range
3. Verify data matches the expected time window

### Edge Case Testing
1. Query "Last 24 hours" at 1:00 AM - verify yesterday's data shows with date context
2. Query "Last 30 days" - verify x-axis is readable and not crowded
3. Select specific agent, switch to Gateway tab - verify gateway metrics visibility

---

*Document generated from code analysis on March 1, 2026*
