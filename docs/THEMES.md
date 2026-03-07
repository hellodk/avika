# UI Themes

The Avika frontend supports two themes selectable under **Settings → General → Appearance**.

## Available themes

| Theme   | Description                       | Mode  |
|--------|-----------------------------------|-------|
| **Dark**  | Default dark palette (black/slate) | Dark  |
| **Light** | Light gray/white with blue primary | Light |

## Technical notes

- Themes are defined in `frontend/src/lib/themes.ts` as RGB triplets (for `rgb(var(--theme-*))`).
- **`THEME_IDS`** in `themes.ts` is the ordered list of theme keys shown in the Appearance dropdown (`["dark", "light"]`).
- `ThemeProvider` applies tokens to `document.documentElement` and sets `data-theme` and `class="dark"` or `class="light"` so both custom UI and shadcn stay in sync.
- Preference is persisted in `localStorage` under the key `theme`.

## If a theme does not appear

1. **Stale build or cache** — Stop the dev server, run `rm -rf .next` in `frontend`, then `npm run dev`. For production, rebuild the image or run `npm run build` again.
2. **Hard refresh** — Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS) in the browser.
