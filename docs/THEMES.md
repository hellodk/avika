# UI Themes

The Avika frontend supports multiple themes selectable under **Settings → General → Appearance**.

## Available themes

| Theme        | Description                          | Mode  |
|-------------|--------------------------------------|-------|
| **Dark**    | Default dark palette (black/slate)    | Dark  |
| **Light**   | Light gray/white with blue primary    | Light |
| **UI Kit**  | Figma Dashboard UI Kit–style (slate + indigo) | Light |
| **Rocker**  | Rocker / Bootstrap 5–style light theme | Light |

## UI Kit theme (Figma reference)

The **UI Kit** theme is inspired by the [Dashboard UI Kit – Free Admin Dashboard](https://www.figma.com/community/file/1210542873091115123/dashboard-ui-kit-dashboard-free-admin-dashboard) Figma file.

- **Palette**: Slate backgrounds (`#f8fafc` / white), indigo primary (`#6366f1`), high-contrast text.
- **Use case**: Clean, light admin-dashboard look with WCAG AA contrast.

## Rocker theme (Bootstrap 5 reference)

The **Rocker** theme is aligned with the [Rocker – Bootstrap 5 Admin Dashboard Template](https://codervent.com/rocker/demo/vertical/index.html) light style.

- **Palette**: Bootstrap 5–style — background `#f8f9fa` (bg-light), white cards, primary blue `#0d6efd`, body text `#212529`, muted `#6c757d`, borders `#dee2e6`. Success/warning/error use Bootstrap’s green, amber, and red.
- **Use case**: Light admin dashboard look consistent with Bootstrap 5–based templates.

## Technical notes

- Themes are defined in `frontend/src/lib/themes.ts` as RGB triplets (for `rgb(var(--theme-*))`).
- **`THEME_IDS`** in `themes.ts` is the explicit ordered list of theme keys shown in the Appearance dropdown. The dropdown renders from `THEME_IDS` so that all themes (including UI Kit and Rocker) always appear.
- `ThemeProvider` applies tokens to `document.documentElement` and sets `data-theme` and `class="dark"` or `class="light"` so both custom UI and shadcn stay in sync.
- Preference is persisted in `localStorage` under the key `theme`.

## If a theme does not appear

1. **Stale build or cache** — Stop the dev server, run `rm -rf .next` in `frontend`, then `npm run dev`. For production, rebuild the image or run `npm run build` again.
2. **Wrong branch or deploy** — Ensure the code includes all theme entries in `themes` and `THEME_IDS` in `themes.ts`.
3. **Hard refresh** — Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS) in the browser.
4. **Verify in code** — `frontend/src/lib/themes.ts` must export all theme entries and `THEME_IDS`; `appearance-settings.tsx` must use `THEME_IDS.map(...)` for the dropdown.
