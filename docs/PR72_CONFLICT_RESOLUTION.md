# PR #72 conflict resolution

**PR:** [hellodk/avika#72](https://github.com/hellodk/avika/pull/72/conflicts)  
**Source:** `feature/dashboard-refresh-timepicker-themes` → **Target:** `master`  
**Status:** Mergeable: dirty (1 conflict)

---

## Conflict summary

| File | Cause | Resolution |
|------|--------|------------|
| `frontend/src/app/servers/[id]/page.tsx` | Both branches added a new import on the same line block | **Keep both imports** |

---

## Detail: `frontend/src/app/servers/[id]/page.tsx`

- **Location:** Imports block (around lines 14–18).
- **HEAD (feature branch):** Added  
  `import { RefreshButton } from "@/components/ui/refresh-button";`  
  (from generic RefreshButton work.)
- **master:** Added  
  `import Link from "next/link";`  
  (from another change on master, e.g. new links on server detail.)

**Resolution:** Keep both lines (no functional overlap):

```ts
import { RefreshButton } from "@/components/ui/refresh-button";
import Link from "next/link";
```

---

## Steps to resolve (maintainer)

1. **Merge master into the feature branch (locally):**
   ```bash
   git fetch origin
   git checkout feature/dashboard-refresh-timepicker-themes
   git merge origin/master
   ```

2. **Resolve the single conflict** in `frontend/src/app/servers/[id]/page.tsx`:  
   Replace the conflict block with both imports as above.

3. **Verify:**
   ```bash
   npm run build   # in frontend/
   ```

4. **Complete the merge and push:**
   ```bash
   git add frontend/src/app/servers/[id]/page.tsx
   git commit -m "Merge origin/master into feature/dashboard-refresh-timepicker-themes"
   git push origin feature/dashboard-refresh-timepicker-themes
   ```

After that, PR #72 should show as mergeable (no conflicts).
