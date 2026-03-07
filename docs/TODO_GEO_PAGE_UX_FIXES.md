# TODO: Geo Analytics Page UI/UX Improvements

**Page:** `/avika/geo`  
**File:** `frontend/src/app/geo/page.tsx`  
**Created:** 2026-02-16  
**Status:** ✅ COMPLETED (2026-02-16)

---

## Executive Summary

The Geo Analytics page has several UI/UX issues affecting usability, accessibility, and SRE workflows. This document outlines all identified issues, prioritized fixes, and implementation approach.

---

## Issue Categories

### Priority Legend
- 🔴 **P0 - Critical**: Blocks core functionality or accessibility
- 🟠 **P1 - High**: Significantly impacts user experience
- 🟡 **P2 - Medium**: Affects usability but has workarounds
- 🟢 **P3 - Low**: Minor improvements

---

## 1. Data Freshness & Error Handling

### 1.1 Add Data Staleness Indicator 🔴 P0
**Current:** No indication when data was last updated  
**Impact:** Users may act on stale data during outages  
**Fix:**
- [ ] Add "Last updated: X seconds ago" badge in header
- [ ] Show warning banner if data >30s stale
- [ ] Add pulsing dot indicator for real-time connection status
- [ ] Display error toast if refresh fails (currently silent)

### 1.2 Improve Refresh Error Visibility 🟠 P1
**Current:** Errors suppressed; stale data shown without indication  
**Impact:** Users unaware of data fetch failures  
**Fix:**
- [ ] Show error banner on refresh failure
- [ ] Keep displaying last-known-good data with "Data may be stale" warning
- [ ] Add retry button in error state
- [ ] Log refresh failures to console for debugging

---

## 2. Accessibility (WCAG 2.1 Compliance)

### 2.1 Color-Only Status Indicators 🔴 P0
**Current:** Map markers use only color (red/yellow/green) for error states  
**Impact:** Fails WCAG 2.1 - unusable for color-blind users  
**Fix:**
- [ ] Add shape indicators: ● healthy, ▲ warning, ◆ critical
- [ ] Add icon overlays on markers (checkmark, warning, x)
- [ ] Ensure pattern/texture differences in addition to color

### 2.2 Keyboard Navigation for Map 🔴 P0
**Current:** Map markers only respond to mouse events  
**Impact:** Keyboard-only users cannot interact with map  
**Fix:**
- [ ] Add `tabIndex` to map container
- [ ] Implement arrow key navigation between markers
- [ ] Add Enter/Space to select marker
- [ ] Show focus ring on selected marker
- [ ] Add skip link to bypass map for screen readers

### 2.3 Missing ARIA Labels 🟡 P2
**Current:** Multiple interactive elements lack proper labels  
**Impact:** Screen readers cannot describe controls  
**Fix:**
- [ ] Add `aria-label` to tab triggers
- [ ] Add `aria-label` to search input
- [ ] Add `aria-describedby` for map regions
- [ ] Add `role="status"` for live updating elements

### 2.4 Focus States 🟡 P2
**Current:** Custom zoom controls lack visible focus indicators  
**Impact:** Keyboard users can't see current focus position  
**Fix:**
- [ ] Add focus ring styles to zoom +/- buttons
- [ ] Add focus styles to all custom controls

---

## 3. Data Presentation

### 3.1 Add Latency to Live Requests Table 🟠 P1
**Current:** Live Requests tab shows no response latency  
**Impact:** Critical SRE metric missing for troubleshooting  
**Fix:**
- [ ] Add "Latency (ms)" column to requests table
- [ ] Color-code latency: green <100ms, yellow 100-500ms, red >500ms
- [ ] Show latency histogram in tooltip

### 3.2 Add Sortable Table Columns 🟠 P1
**Current:** Country/City/Requests tables cannot be sorted  
**Impact:** Difficult to analyze data patterns  
**Fix:**
- [ ] Add sort icons to column headers
- [ ] Implement ascending/descending sort
- [ ] Persist sort preference in component state
- [ ] Default sort: requests DESC for traffic tables

### 3.3 Add Latency Percentiles 🟠 P1
**Current:** Only average latency displayed  
**Impact:** Averages hide outliers; SREs need percentiles  
**Fix:**
- [ ] Add p50, p95, p99 latency metrics
- [ ] Display in tooltip on hover
- [ ] Consider adding percentile toggle in UI

### 3.4 Expandable URI Column 🟡 P2
**Current:** URIs truncated with CSS `truncate`, only title tooltip  
**Impact:** Hard to see full paths for debugging  
**Fix:**
- [ ] Add click-to-expand functionality
- [ ] Or add copy-to-clipboard button
- [ ] Consider modal/drawer for full request details

### 3.5 Truncated City Names 🟡 P2
**Current:** Names >15 chars truncated to 13 + `...`  
**Impact:** Context lost; tooltip only on hover  
**Fix:**
- [ ] Increase truncation threshold to 20 chars
- [ ] Add tooltip with full name + country
- [ ] Consider responsive truncation based on column width

### 3.6 Consistent Timestamp Format 🟢 P3
**Current:** Uses `toLocaleTimeString()` which varies by browser  
**Impact:** Inconsistent display across team members  
**Fix:**
- [ ] Use fixed format: `HH:mm:ss.SSS`
- [ ] Add timezone indicator (UTC or local with label)
- [ ] Consider user preference setting

---

## 4. Theme & Color Consistency

### 4.1 Hardcoded Chart Colors 🟡 P2
**Current:** `PIE_COLORS` and error threshold colors use hardcoded hex  
**Impact:** Colors don't adapt to theme changes  
**Fix:**
- [ ] Import colors from `@/lib/chart-colors.ts`
- [ ] Use `getChartColorsForTheme(theme)` for all chart colors
- [ ] Replace hardcoded error colors with theme tokens

### 4.2 Hardcoded Badge Colors 🟡 P2
**Current:** `bg-green-500` success badge hardcoded  
**Impact:** Doesn't adapt to theme  
**Fix:**
- [ ] Use theme-aware success color
- [ ] Apply to all status badges consistently

### 4.3 Low Contrast Map Legend 🟡 P2
**Current:** Legend uses `--theme-text-muted` on semi-transparent background  
**Impact:** May fail WCAG contrast requirements  
**Fix:**
- [ ] Increase legend background opacity
- [ ] Use `--theme-text` instead of muted variant
- [ ] Test contrast ratio in all themes

---

## 5. Navigation & State Management

### 5.1 URL State Persistence 🟠 P1
**Current:** Tab, time window, search not persisted in URL  
**Impact:** Refreshing loses investigation context  
**Fix:**
- [ ] Add URL params: `?tab=overview&window=1h&search=...`
- [ ] Implement `useSearchParams` hook
- [ ] Update URL on state changes (replace, not push)
- [ ] Read initial state from URL on mount

### 5.2 Deep Linking to Locations 🟡 P2
**Current:** Cannot link directly to specific country/city  
**Impact:** Cannot share investigation context  
**Fix:**
- [ ] Add `?location=US` or `?city=New+York` param
- [ ] Auto-select location on page load if param present
- [ ] Update param when location selected

---

## 6. Layout & Responsiveness

### 6.1 Tooltip Viewport Overflow 🟠 P1
**Current:** Tooltip positioned at `clientX/clientY`, overflows edges  
**Impact:** Tooltips cut off at map boundaries  
**Fix:**
- [ ] Detect viewport boundaries
- [ ] Flip tooltip position when near edge
- [ ] Consider using Radix UI Tooltip primitive

### 6.2 Header Overflow on Mobile 🟡 P2
**Current:** Search + Select + Button may overflow narrow screens  
**Impact:** Controls unusable on mobile  
**Fix:**
- [ ] Stack controls vertically on small screens
- [ ] Add responsive breakpoints
- [ ] Consider collapsible filter panel

### 6.3 Fixed Chart Height 🟡 P2
**Current:** Charts use fixed `height={300}`  
**Impact:** May be too small/large on various screens  
**Fix:**
- [ ] Use responsive height based on viewport
- [ ] Or use aspect ratio instead of fixed height
- [ ] Minimum height: 200px, max: 400px

### 6.4 Table Scroll Affordance 🟢 P3
**Current:** Tables have `overflow-auto` but no scroll indicator  
**Impact:** Users may not know content is scrollable  
**Fix:**
- [ ] Add fade gradient on scrollable edge
- [ ] Or add scroll shadow effect

---

## 7. SRE-Specific Features

### 7.1 SLO Threshold Visualization 🟠 P1
**Current:** No visual SLA/SLO threshold lines on charts  
**Impact:** Hard to see when metrics breach thresholds  
**Fix:**
- [ ] Add configurable threshold lines (e.g., 99.9% SLO)
- [ ] Show error rate threshold at 1%, 5%
- [ ] Color breach regions in charts

### 7.2 Anomaly Highlighting 🟡 P2
**Current:** Traffic spikes/error rate increases not highlighted  
**Impact:** Anomalies easy to miss  
**Fix:**
- [ ] Detect >2σ deviations from baseline
- [ ] Highlight anomaly points on charts
- [ ] Add anomaly badge/notification

### 7.3 Export Functionality 🟡 P2
**Current:** No export option for geo data  
**Impact:** Cannot include data in incident reports  
**Fix:**
- [ ] Add "Export CSV" button
- [ ] Export current view data (filtered)
- [ ] Include timestamp and filters in export

### 7.4 Historical Comparison 🟢 P3
**Current:** No comparison with historical baseline  
**Impact:** Hard to determine if current state is normal  
**Fix:**
- [ ] Add "Compare with" dropdown (yesterday, last week)
- [ ] Show comparison line on charts
- [ ] Display delta percentages

---

## Implementation Plan

### Phase 1: Critical Fixes (P0)
1. Data staleness indicator
2. Accessibility: color-blind safe markers
3. Accessibility: keyboard navigation

### Phase 2: High Priority (P1)
4. Add latency to Live Requests
5. Sortable table columns
6. URL state persistence
7. Tooltip overflow fix
8. SLO threshold lines

### Phase 3: Medium Priority (P2)
9. Theme-aware chart colors
10. Latency percentiles
11. Expandable URIs
12. Deep linking
13. Anomaly highlighting
14. Export functionality

### Phase 4: Low Priority (P3)
15. Timestamp format consistency
16. Table scroll affordance
17. Historical comparison
18. Responsive chart heights

---

## Estimated Effort

| Phase | Items | Estimated Time |
|-------|-------|----------------|
| Phase 1 | 3 | ~4-6 hours |
| Phase 2 | 5 | ~6-8 hours |
| Phase 3 | 6 | ~8-10 hours |
| Phase 4 | 4 | ~4-6 hours |
| **Total** | **18** | **~22-30 hours** |

---

## Dependencies

- `@/lib/chart-colors.ts` - for theme-aware colors
- `@/lib/themes.ts` - for theme context
- Consider adding `@tanstack/react-table` for sortable tables
- Consider Radix UI Tooltip for better positioning

---

## Review Checklist

- [ ] Review with UX team
- [ ] Accessibility audit after Phase 1
- [ ] Test in all 4 themes (Dark, Light, Solarized, Nord)
- [ ] Mobile responsiveness testing
- [ ] Performance impact assessment
