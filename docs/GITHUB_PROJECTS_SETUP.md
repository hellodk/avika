# GitHub Projects: Setup and Repo Link

We track the Agent Features implementation plan in a **user-scoped** GitHub Project, then **link it to the repo** so it appears under the repository’s Projects tab.

## Project URL

- **Project (owner view):** https://github.com/users/hellodk/projects/1  
- **Same project from repo (after linking):** https://github.com/hellodk/avika/projects

## Make the project show in the repo (repo-scoped view)

So the project appears at [https://github.com/hellodk/avika/projects](https://github.com/hellodk/avika/projects):

1. Open the project: https://github.com/users/hellodk/projects/1  
2. In the **top-right** of the project, open the **dropdown menu** (⋮) → **Settings**.  
3. Under **Default repository**, select **hellodk/avika**.  
4. Click **Save changes**.

After this, the project is linked to the repo and will show under **Projects** for [hellodk/avika](https://github.com/hellodk/avika/projects). New draft issues created from the project will default to this repo.

## Alternative: link from the repository

1. Open https://github.com/hellodk/avika  
2. Click **Projects** → **Link a project**.  
3. Search for **Agent Features Implementation** (owned by hellodk) and link it.

## Implementation plan and issues

- **Plan:** [docs/implementation-plan-agent-features.md](implementation-plan-agent-features.md)  
- **Issues:** 16 issues (e.g. #42–#57) with labels `phase-1`…`phase-5`, `status-done` / `status-todo`, all added to this project.

## Custom fields (optional)

In the project you can add:

- **Phase** (single select): Phase 1 … Phase 5  
- **Status** (or use the built-in Status): Todo, In progress, Done  

Filter/group by these or by the issue labels to match the implementation plan.
