# Proposal: Unified search with fuzzy logic and autocomplete

Replace the current scope dropdown (Instances / Monitoring / Settings) with a **single search input** that uses **fuzzy matching** and **autocomplete** to suggest and navigate to the right target.

---

## Data sources for suggestions

| Source | Data | How we get it |
|--------|------|----------------|
| **Instances** | hostname, agent_id, IP | `GET /api/servers` (already used elsewhere; can cache in layout or fetch on search open) |
| **Pages** | Dashboard, Monitoring, Inventory, Analytics, Alerts, Settings, Integrations, etc. | Static list derived from nav (NAV_SECTIONS) + settings sub-pages |
| **Settings keywords** | Prometheus, Grafana, ClickHouse, Postgres, Display, Security, LLM, WAF | Static list so "prom" → Integrations (Prometheus), "grafana" → Integrations |

---

## Proposal A: Command-palette style (recommended)

**Behaviour**

- Single input, no dropdown for scope. Placeholder e.g. *"Search instances, pages, settings…"*.
- On **focus** or after **1–2 characters**: show a **suggestion panel** below the input.
- Suggestions are **grouped** (e.g. **Instances**, **Pages**, **Settings**).
- **Fuzzy match** on query: filter and rank all suggestions (instances + pages + settings keywords) with a simple fuzzy algorithm (substring + typo tolerance).
- **Keyboard**: ↑↓ to move, Enter to select. **Mouse**: click to select.
- **On select**: navigate (e.g. instance → `/inventory?q=<id>` or `/servers/<id>`, page → `/monitoring`, "Prometheus" → `/settings?q=prometheus` or scroll to Integrations).
- **On submit without selection** (Enter with no highlight): **smart default** – if any suggestion is a clear best match, use it; otherwise go to Inventory with `?q=...` (current “instances” behaviour).

**Fuzzy logic (no new dependency)**

- Normalize: lowercase, trim.
- **Score 1**: exact substring match (e.g. query in hostname).
- **Score 2**: word-boundary match (e.g. "graf" matches "Grafana").
- **Score 3**: character-order match with no skips (e.g. "prm" matches "Prometheus") – optional.
- Sort by score, then by string length (prefer shorter, more specific matches).

**Pros**: One box, discoverable, works for instances + monitoring + settings; no scope dropdown.  
**Cons**: Need to fetch/cache instances for autocomplete; a bit more UI (suggestion panel).

---

## Proposal B: Autocomplete only for instances + keyword routing on submit

**Behaviour**

- Single input. **Autocomplete dropdown** shows only **matching instances** (from `/api/servers`), fuzzy filtered.
- **No** dropdown for “Settings / Monitoring / Instances”.
- On **submit** (Enter or search button):
  - If query **matches a known keyword** → route: e.g. "monitoring" → `/monitoring`, "settings" / "integrations" / "prometheus" / "grafana" → `/settings?q=...`, "alerts" → `/alerts`.
  - Else → **Instances**: `/inventory?q=...` (and inventory page filters by q as today).

**Fuzzy for instances**

- Same as in A: substring, optional word-boundary or character-order.
- Optional: show 1–2 “Quick go to” lines at top of dropdown (e.g. “Go to Monitoring”, “Go to Settings”) that also fuzzy-match the query.

**Pros**: Simpler than A, no static list of pages to maintain beyond keywords; instances get full fuzzy + autocomplete.  
**Cons**: Less discoverable for “which page” (users must type a keyword or use quick links if we add them).

---

## Proposal C: Hybrid with “suggested destinations” + instance search

**Behaviour**

- Single input. On focus or after 1 character:
  - **Top section**: “Suggested destinations” – e.g. Monitoring, Settings, Integrations, Inventory, Alerts – **fuzzy filtered** by query (so "set" → Settings, "int" → Integrations).
  - **Bottom section**: “Instances” – from API, **fuzzy filtered** by hostname / agent_id / IP.
- One list or two clear groups; same keyboard/mouse behaviour as A.
- On select: same as A (navigate to page or instance).
- On submit without select: same smart default as A (e.g. best match or Inventory with q).

**Pros**: Clear split “places to go” vs “things (instances)”; good for “I want Settings” vs “I want server X”.  
**Cons**: Slightly more UI logic (two sections, possibly different data sources).

---

## Recommendation

**Proposal A (command-palette style)** gives the best UX: one place to search everything, fuzzy + autocomplete, no scope dropdown, and behaviour stays predictable (select or submit). Implementation can start with a **static list of pages + settings keywords** and **optional instance fetch** (or reuse project/layout data if we already have it), plus a **small in-app fuzzy scorer** (no new dependency).

If you prefer minimal scope and simpler implementation, **Proposal B** is a good fallback (instances autocomplete + keyword routing, no page list).

---

## Implementation notes (for A or C)

1. **Remove** the scope `Select` from the header; keep a single input + search button.
2. **Suggestions panel**: absolute below input, z-index above header, max height + scroll; dismiss on blur (with small delay so click on suggestion works) and on Escape.
3. **Instances**: fetch `GET /api/servers` when the search input is first focused (or on first 1–2 chars); cache for the session to avoid repeated calls.
4. **Fuzzy**: implement a small `scoreQuery(item, query)` (e.g. substring, then word-boundary, then optional char-order); filter `score > 0` and sort by score.
5. **Navigation**: map suggestion type to route (instance → `/inventory?q=...` or `/servers/<id>`, page → path, settings keyword → `/settings?q=...`).
6. **Accessibility**: aria-expanded, aria-activedescendant, role="listbox" for suggestion list, and keyboard handling (ArrowDown/Up, Enter, Escape).
