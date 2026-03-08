# GitHub Actions: 5 Workflows per Push/Merge – Analysis & Optimization

## What’s happening

For **one** logical change (open PR → merge to `master`), **5 workflow runs** are triggered:

| # | Workflow   | Trigger              | When        |
|---|------------|----------------------|-------------|
| 1 | **CI**     | Pull request opened  | PR #78      |
| 2 | **CodeQL** | Pull request         | PR #78      |
| 3 | **CI**     | Push to `master`     | After merge |
| 4 | **Release**| Push to `master`     | After merge |
| 5 | **CodeQL** | Push to `master`     | After merge |

So:

- **CI** runs twice for the same commit: once on the PR branch, once on `master` after merge.
- **Release** runs on every push to `master`/`main` (then may exit early if `should_release=false`).
- **CodeQL** runs twice: once for the PR, once for the push to `master`.

All of this is correct from a “validate everything” point of view, but it’s redundant and expensive for a single merge.

---

## Root causes

1. **CI**  
   - `on: pull_request` → run on PR.  
   - `on: push` (including `master`) → run again on merge.  
   Same commit is therefore validated twice.

2. **Release**  
   - `on: push: branches: [master, main]` → runs on every push to default branch.  
   - The “analyze commits” step can set `should_release=false`, but the workflow still starts and runs at least one job.

3. **CodeQL**  
   - Typically configured at org/repo level to run on both `pull_request` and `push` (often to default branch).  
   - So the same diff is analyzed on the PR and again on `master` after merge.

---

## Recommended optimizations

### 1. Avoid duplicate CI on the same commit (high impact)

**Option A – CI only on `pull_request` for default branch**

- For branches that target `master`/`main`, rely on CI from the **PR** only.
- Do **not** run CI on `push` to `master`/`main`.
- Keep `push` for other branches (e.g. `develop`, `feat/*`) if you want CI on direct pushes there.

Effect: one fewer run per merge (no second CI on `master`).

**Option B – Concurrency (cancel in-progress runs)**

- Add a `concurrency` group so that a new run for the same ref cancels the previous one.
- Doesn’t reduce the number of *triggered* runs, but reduces wasted work when multiple pushes or re-runs happen quickly.

### 2. Run Release only when a release is intended (medium impact)

- Today: every push to `master` starts the Release workflow; it may exit early.
- Improvement: trigger Release only when a release is actually desired:
  - **Option A:** Only `workflow_dispatch` (manual “Create release”).
  - **Option B:** Push to `master` **and** a condition (e.g. commit message or label) so that “analyze” runs only when a release is likely. Keep `workflow_dispatch` for ad-hoc releases.

Effect: fewer Release runs on routine merges; same behavior when you do want a release.

### 3. CodeQL (if you control it)

- If CodeQL is configured in the repo (e.g. under `.github/workflows`), you can:
  - Run it **only on push to default branch** (and optionally on schedule), **or**
  - Run it **only on `pull_request`** to default branch.  
- That removes the duplicate “PR + push” for the same change.

If CodeQL is org-level or managed elsewhere, adjust it there (same idea: avoid both PR and push for the same logical change).

### 4. Optional: Single workflow for “merge to master”

- Combine “CI” and “Release” into one workflow that:
  - On `pull_request`: lint, test, build (and optionally Docker build test).
  - On `push` to `master`/`main`: same checks **plus** release steps (with `if: should_release`).
- One workflow file, one run per event; avoids “CI + Release” as two separate runs on the same push.

---

## Suggested implementation order

1. **Add concurrency** to CI and Release (low risk, reduces wasted runs).
2. **Stop running CI on push to `master`/`main`** (Option A above) so the same commit is not validated twice.
3. **Tighten Release triggers** (e.g. only `workflow_dispatch`, or add conditions on push to `master`).
4. **Adjust CodeQL** (if possible) so it runs once per change (e.g. only on push to default branch or only on PRs).

Result: for one “open PR → merge” you can go from **5** runs down to **2–3** (e.g. CI on PR, Release only when needed, CodeQL once), with concurrency protecting against redundant in-progress runs.

---

## Implemented in this repo

- **CI**  
  - **Push:** no longer runs on `master`/`main`. Same commit is already validated via the PR; this removes the duplicate CI run after merge.  
  - **Concurrency:** `group: ci-${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` so a new run for the same ref cancels the previous one.

- **Release**  
  - **Concurrency:** `group: release-${{ github.ref }}`, `cancel-in-progress: false` so release runs are not cancelled mid-way.

- **CodeQL**  
  - Not defined in this repo (likely org/default workflow). To get down to one CodeQL run per change, configure it to run only on `pull_request` to default branch, or only on `push` to default branch, in the repo or org settings.
