# Light theme visibility fixes – analysis and plan

## Problem

In the **light theme**, some hover states use **white or very light backgrounds** and **light or white text/icons**, which makes hovered elements hard or impossible to see (e.g. white on white, or very low contrast).

---

## Root causes

1. **`hover:bg-white/5`** – 5% white overlay. On light theme (background ~white/light gray), this is almost invisible and does not read as a hover state.
2. **`hover:text-white`** – Used on table headers and links. On light backgrounds, white text is invisible.
3. **Hardcoded dark-only colors** – `neutral-7xx`, `neutral-9xx`, `bg-neutral-950`, `text-neutral-100`, `slate-3xx/7xx/8xx` used without a light-theme alternative, so in light theme these stay dark and either clash or make content invisible.
4. **Icons in gradient boxes** – `text-white` on blue–purple gradient is fine; the issue is **other** icon+hover combos that end up light-on-light (e.g. icon color not theme-aware, or hover bg too light).

---

## Occurrences (by category)

### 1. Sidebar and header – `hover:bg-white/5` (light theme: no visible hover)

| File | Location | Element |
|------|----------|--------|
| `components/dashboard-layout.tsx` | ~178 | Section toggles (OVERVIEW, INFRASTRUCTURE, etc.) |
| `components/dashboard-layout.tsx` | ~210 | “Collapse” button |
| `components/dashboard-layout.tsx` | ~219 | Expand (chevron) button when collapsed |
| `components/dashboard-layout.tsx` | ~277 | Help (?) icon button |
| `components/dashboard-layout.tsx` | ~287 | Notifications (bell) icon button |
| `components/dashboard-layout.tsx` | ~302 | User menu trigger (avatar + name) |

**Issue:** In light theme, hover adds almost no visible change; if any icon or text were light, it would be unreadable. Currently text/icon use `--theme-text-muted` (dark in light theme), so the main problem is **hover feedback**, not icon color.

---

### 2. Tables and rows – `hover:bg-white/5` or `hover:text-white`

| File | Location | Issue |
|------|----------|--------|
| `app/audit/page.tsx` | ~103 | `TableRow` with `hover:bg-white/5` – light theme hover barely visible. |
| `app/settings/waf/page.tsx` | ~93 | Same. |
| `app/waf/page.tsx` | ~93 | Same. |
| `components/agent-fleet-table.tsx` | ~409, 415, 422, 429 | Sort buttons: `hover:text-white` – **white text on light background = invisible** in light theme. |
| `components/agent-fleet-table.tsx` | ~478 | Link `text-white hover:text-blue-400` – row may be light in light theme; white text invisible. |

---

### 3. Grafana / observability

| File | Location | Issue |
|------|----------|--------|
| `app/observability/grafana/page.tsx` | ~181, 245, 255, 265, 279 | `hover:bg-white/5` on dashboard cards and buttons – same as (1). |

---

### 4. Select and form controls – hardcoded dark (broken in light theme)

| File | Location | Issue |
|------|----------|--------|
| `components/ui/select.tsx` | ~21 (SelectTrigger) | `border-neutral-700 bg-neutral-900` – always dark; in light theme contrast is wrong and looks broken. |
| `components/ui/select.tsx` | ~77 (SelectContent) | `border-neutral-700 bg-neutral-900 text-neutral-100` – same. |
| `components/ui/select.tsx` | ~120 (SelectItem) | `focus:bg-neutral-800 focus:text-neutral-100` – same. |
| `app/settings/integrations/page.tsx` | ~47–96 | Multiple `bg-neutral-950 border-neutral-800 text-white` / `text-neutral-300` – dark-only. |
| `app/settings/llm/page.tsx` | ~143–212 | Same pattern: `bg-neutral-950 border-neutral-800 text-white`, `text-neutral-300`. |
| `app/agents/[id]/config/page.tsx` | ~243–417 | Same: many inputs/selects with dark-only classes. |

---

### 5. Other hover / text that fail in light theme

| File | Location | Issue |
|------|----------|--------|
| `components/TerminalOverlay.tsx` | ~149 | Close button: `text-neutral-500 hover:text-white` – terminal is dark so OK there; for reuse or if background ever becomes light, should be theme-aware. |
| `app/analytics/page.tsx` | ~1029, 1032, 1035, 1038, 1277, 1280, 1283, 1286, 1289 | TableHead sort: `text-slate-300 hover:text-white` – **light theme: white on light = invisible**. |
| `app/analytics/traces/page.tsx` | ~99, 122, 152, 169, etc. | Whole page uses `slate-7xx/8xx`, `text-white`, `hover:text-white` – dark-only; in light theme would be wrong. |
| `app/login/page.tsx` / `app/change-password/page.tsx` | Various | Left panel and inputs use `text-white`, `bg-slate-900/50`, `text-slate-300` – designed for dark; optional later to add light variant. |

---

## Fix plan

### Phase 1: Global theme-aware hover (high impact, low risk)

1. **Add a shared hover utility in `app/globals.css`**
   - New class, e.g. `.hover-surface`, that:
     - **Light theme:** `[data-theme="light"] & .hover-surface:hover { background: rgba(0,0,0,0.06); }` (or use a new `--theme-hover` variable).
     - **Dark (and other) themes:** keep current behavior, e.g. `background: rgba(255,255,255,0.05);` (or same via variable).
   - Optionally introduce `--theme-hover` and `--theme-hover-foreground` in `themes.ts` and set them in `theme-provider.tsx` so one utility works for all themes.

2. **Replace all `hover:bg-white/5` in layout and shared UI** with this class (or the same logic via Tailwind + `data-theme`):
   - `dashboard-layout.tsx`: section toggles, Collapse/Expand, Help, Notifications, User menu trigger.
   - `audit/page.tsx`, `settings/waf/page.tsx`, `waf/page.tsx`: table row hover.
   - `observability/grafana/page.tsx`: card/button hovers.

3. **Ensure sidebar/header icons and text stay theme-aware**
   - They already use `style={{ color: 'rgb(var(--theme-text-muted))' }}` in most places; double-check that no icon uses `text-white` outside the gradient logo/avatar boxes (those are OK).

**Deliverable:** One CSS utility + one pass over “hover:bg-white/5” usages. No new components.

---

### Phase 2: Table headers and sortable columns (visibility bug)

1. **agent-fleet-table.tsx**
   - Sort buttons: remove `hover:text-white`. Use theme-aware hover:
     - e.g. `hover:opacity-80` and keep text color from theme, or
     - `style={{ color: 'rgb(var(--theme-text-muted))' }}` and add a hover background (e.g. same `.hover-surface` or `hover:bg-[rgb(var(--theme-surface-light))]`).
   - Server link (around 478): replace `text-white` with theme text (e.g. `style={{ color: 'rgb(var(--theme-text))' }}`) and use `hover` with primary or theme color so it works on both light and dark.

2. **analytics/page.tsx**
   - TableHead sort: replace `text-slate-300 hover:text-white` with theme-based text and hover (e.g. `--theme-text-muted` + `.hover-surface` or equivalent), so light theme never shows white text on light background.

**Deliverable:** No more `hover:text-white` on light backgrounds; all table header and link hovers theme-aware.

---

### Phase 3: Select and form controls (light theme support)

1. **components/ui/select.tsx**
   - Replace hardcoded `border-neutral-700 bg-neutral-900 text-neutral-100` and `focus:bg-neutral-800 focus:text-neutral-100` with theme variables:
     - e.g. `border-[rgb(var(--theme-border))]`, `bg-[rgb(var(--theme-surface))]`, `text-[rgb(var(--theme-text))]`,
     - focus: `focus:bg-[rgb(var(--theme-surface-light))]`, `focus:text-[rgb(var(--theme-text))]`.
   - Or use Tailwind semantic tokens if they are wired to `--theme-*` (or add a small layer that maps them for this app).

2. **Settings and agent config pages**
   - `app/settings/integrations/page.tsx`, `app/settings/llm/page.tsx`, `app/agents/[id]/config/page.tsx`:
   - Replace `bg-neutral-950 border-neutral-800 text-white` and `text-neutral-300` with theme vars:
     - Background: `rgb(var(--theme-surface))` or `rgb(var(--theme-background))`
     - Border: `rgb(var(--theme-border))`
     - Text: `rgb(var(--theme-text))` / `rgb(var(--theme-text-muted))`
   - Apply the same to inputs and Selects so they look correct in light theme.

**Deliverable:** Select and these forms usable and readable in light theme.

---

### Phase 4: Optional / follow-up

1. **TerminalOverlay**
   - Close button: switch to theme vars (e.g. `color: rgb(var(--theme-text-muted))` and hover to `rgb(var(--theme-text))`) so it works if the overlay is ever shown on a light background.

2. **Analytics traces page**
   - Page is heavily dark (slate-8xx, white text). Either:
     - Add a full light-theme variant (replace slate/white with theme vars), or
     - Document as “dark-optimized” and at least fix any shared components (e.g. table rows) that use `hover:bg-white/5` or `hover:text-white`.

3. **Login / change-password**
   - Currently dark-only. Optional: add a light-theme layout variant (e.g. different left panel and input styles when `data-theme="light"`) so no white-on-white on any breakpoint.

---

## Implementation order (recommended)

1. **Phase 1** – Global hover utility + replace `hover:bg-white/5` in layout, audit, waf, grafana. Quick win for “hover on icons” and sidebar/header.
2. **Phase 2** – agent-fleet-table and analytics table headers; removes the worst “white text on white” cases.
3. **Phase 3** – Select + settings/agent forms so dropdowns and inputs are not dark-only.
4. **Phase 4** – As needed for Terminal, traces, and login.

---

## Theme variable usage (reference)

- **Background:** `rgb(var(--theme-background))`
- **Surface / cards:** `rgb(var(--theme-surface))`
- **Surface hover / slightly elevated:** `rgb(var(--theme-surface-light))`
- **Text:** `rgb(var(--theme-text))`
- **Text muted (secondary):** `rgb(var(--theme-text-muted))`
- **Borders:** `rgb(var(--theme-border))`
- **Primary (links, buttons):** `rgb(var(--theme-primary))`

Root has `data-theme="light" | "dark" | "solarized" | "nord"`; use `[data-theme="light"]` in CSS when a rule must differ only in light theme.
