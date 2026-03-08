# RCA: Theme dropdown showing old options (Solarized, Nord) instead of UI Kit and Rocker

## Summary

**Symptom:** The Settings → Appearance → Active Theme dropdown still shows **Dark, Light, Solarized Dark, Nord** and does **not** show **UI Kit** or **Rocker**, even though the codebase has been updated to remove Solarized/Nord and add UI Kit and Rocker.

**Conclusion:** The **running application is serving an old JavaScript bundle**. The source code in the repo is correct; the environment you are viewing (browser/dev server/deployed build) has not picked up the new build.

---

## Verification: source code is correct

- **`frontend/src/lib/themes.ts`**
  - `themes` object contains only: `dark`, `light`, `dashboard` (name: "UI Kit"), `rocker` (name: "Rocker"). No `solarized` or `nord`.
  - `THEME_IDS = ["dark", "light", "dashboard", "rocker"]`.
- **`frontend/src/components/settings/appearance-settings.tsx`**
  - Imports `THEME_IDS` from `@/lib/themes` and renders the dropdown with `THEME_IDS.map(...)`.
  - `themeIcons` has only `dark`, `light`, `dashboard`, `rocker` (no Sparkles for solarized/nord).

There is no other component or route that defines the theme list; the dropdown is driven solely by `THEME_IDS` and `themes` from `themes.ts`. So the **only** way the UI can show Solarized/Nord and not UI Kit/Rocker is by running **old compiled code**.

---

## Root causes (why the old list appears)

### 1. **Stale Next.js build/cache (most likely)**

- Next.js caches compiled output in **`frontend/.next`** (and for dev, in `.next/cache` and `.next/dev`).
- If you:
  - ran `npm run build` or `npm run dev` **before** the theme changes, and
  - never cleared `.next` or restarted after pulling/editing the theme code,  
  then the server may still be serving chunks that contain the old `THEME_IDS` / `themes` (with solarized and nord).
- **Evidence:** The dropdown content is determined at runtime by the client-side JS that imports `themes.ts`. That code is bundled at build time. Old bundle ⇒ old list.

### 2. **Browser cache**

- The browser may be caching previous JS chunks (e.g. the page that contains the settings layout and theme dropdown).
- So even if the server has a new build, the browser might still run the old script until cache is bypassed or cleared.

### 3. **Deployed build not updated**

- If the UI you’re looking at is a **deployed** instance (Docker image, staging, production):
  - The image or static build might have been built from an **older commit** (before Solarized/Nord removal and UI Kit/Rocker addition).
  - Or the deployment might not have been rebuilt/redeployed after the latest push.
- In that case the running app is literally an old build; no amount of local file changes will change it until that deployment is rebuilt and redeployed.

### 4. **Wrong branch or wrong repo**

- Less likely if you’re sure you’re on the right repo and branch, but possible:
  - Building or running from a branch that still has the old themes.
  - Or building from a different clone that wasn’t updated.

---

## Remediation (what to do)

### If you’re running **locally** (e.g. `npm run dev` or `npm run build` + `npm run start`)

1. **Stop** the dev server or the Node process serving the app.
2. **Clear the Next.js cache and rebuild:**
   ```bash
   cd frontend
   rm -rf .next
   npm run build
   # or for dev:
   npm run dev
   ```
3. **Hard-refresh the browser** (or clear site data for localhost) so the browser doesn’t use cached JS:
   - Chrome/Edge: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (macOS).
   - Or DevTools → Application → Clear storage → Clear site data.
4. Open **Settings → Appearance** again; the dropdown should show **Dark, Light, UI Kit, Rocker** (and **no** Solarized or Nord).

### If you’re viewing a **deployed** instance (Docker / staging / production)

1. Ensure the **latest code** (with theme changes) is on the branch you deploy from.
2. **Rebuild** the frontend (e.g. new Docker image or new static build) so that the new `themes.ts` and `THEME_IDS` are in the bundle.
3. **Redeploy** that new build to the environment you’re testing.
4. After deployment, do a **hard refresh** or clear cache when opening the app so the browser loads the new chunks.

### Optional: confirm what’s running

- After clearing cache and restarting, you can temporarily add a small visible hint in the UI (e.g. in the Appearance section) that includes `THEME_IDS.length` or a version string from the build, to confirm the new bundle is loaded.

---

## Prevention

- After theme (or any client-side) changes, get into the habit of:
  - **Restarting** the dev server, or
  - Running a **fresh** `rm -rf .next && npm run build` (and redeploying if applicable),  
  and then **hard-refreshing** the browser when checking the Settings page.
- For CI/CD, ensure the deployment pipeline always builds from the correct branch and that the built artifact is what gets deployed (no accidental reuse of old build outputs).

---

## Summary table

| Cause                         | What to do                                              |
|------------------------------|---------------------------------------------------------|
| Stale `.next` / old build    | `rm -rf frontend/.next` then rebuild / restart dev      |
| Browser cache                | Hard refresh (Ctrl+Shift+R) or clear site data         |
| Deployed build not updated   | Rebuild image/artifact from latest code and redeploy    |
| Wrong branch / wrong clone   | Build and run from the correct repo and branch          |

Once the **running** app is built from the current source, the theme dropdown will show **Dark, Light, UI Kit, Rocker** only.
