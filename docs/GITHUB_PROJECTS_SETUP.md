# GitHub Projects: Setup and Onboarding

This guide explains how we trace development using **GitHub Projects** and how to onboard the Agent Features implementation plan.

## 1. Create and Link the Project

We track the Agent Features implementation plan in a **user-scoped** GitHub Project, then **link it to the repo** so it appears under the repository’s Projects tab.

### Option A: GitHub web UI

1. In your repo, go to **Projects** → **New project** (or **Create project**).
2. Choose **Board** or **Table** (Board gives a Kanban; Table is good for a backlog list).
3. Name it e.g. **"Agent Features Implementation"**.
4. Set **Scope**: this repository (so issues from this repo can be added).

### Option B: GitHub CLI (after `gh auth login`)

```bash
gh project create --owner hellodk --title "Agent Features Implementation" --body "Tracks implementation plan: docs/implementation-plan-agent-features.md"
```

Note the **project number** (e.g. `1`) from the project URL: `https://github.com/users/hellodk/projects/1`.

### Link it to the repo

So the project appears at [https://github.com/hellodk/avika/projects](https://github.com/hellodk/avika/projects):

1. Open the project settings (⋮ → **Settings**).
2. Under **Default repository**, select **hellodk/avika**.
3. Click **Save changes**.

---

## 2. Onboard issues from the implementation plan

Each bullet in the implementation plan becomes one **issue**.

### Script usage

A script creates all issues (with labels) and can add them to your project.

**Prerequisites**

- GitHub CLI: `gh auth login` (include `project` scope: `gh auth refresh -s project`).
- Create the project first and note its **number** (e.g. `1`).

**Run**

```bash
# From repo root. Replace PROJECT_NUMBER if you use a project.
export GITHUB_PROJECT_NUMBER=1   # optional: add issues to this project
./scripts/onboard-issues-to-project.sh
```

The script:
- Creates one issue per task in the implementation plan.
- Adds labels: `phase-1` … `phase-5`, and `status-done` / `status-todo`.
- If `GITHUB_PROJECT_NUMBER` is set, adds each new issue to that project.

---

## 3. Workflow

- **Issues:** ~16 issues (e.g. #42–#57) track the work.
- **Phases:** Use **Phase** (single select) and **Status** custom fields in the project to match `docs/implementation-plan-agent-features.md`.
- **Linking:** Reference the implementation plan [docs/implementation-plan-agent-features.md](implementation-plan-agent-features.md) in the project description.
