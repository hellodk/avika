# Branching Strategy for Avika

## Overview

This document defines the Git branching strategy for the Avika project. All contributors (human and AI agents) must follow these guidelines to maintain code quality and deployment stability.

## Branch Types

### 1. Protected Branches

| Branch | Purpose | Protection Rules |
|--------|---------|------------------|
| `master` | Production-ready code | PRs required, no force push, no direct commits |
| `main` | Legacy/alternate production branch | PRs required, no force push |

### 2. Development Branches

| Branch Pattern | Purpose | Lifecycle |
|----------------|---------|-----------|
| `feature/*` | New features | Created from `master`, merged via PR |
| `fix/*` | Bug fixes | Created from `master`, merged via PR |
| `hotfix/*` | Urgent production fixes | Created from `master`, fast-tracked PR |
| `docs/*` | Documentation updates | Created from `master`, merged via PR |
| `refactor/*` | Code refactoring | Created from `master`, merged via PR |
| `test/*` | Test improvements | Created from `master`, merged via PR |

## Workflow

### Standard Feature Development

```
master ─────────────────────────────────────────────► master
         \                                         /
          └── feature/my-feature ──► PR ──► Review ┘
```

1. **Create branch** from `master`:
   ```bash
   git checkout master
   git pull origin master
   git checkout -b feature/descriptive-name
   ```

2. **Develop** with atomic commits:
   ```bash
   git add <files>
   git commit -m "feat(scope): description"
   ```

3. **Push** to remote:
   ```bash
   git push -u origin feature/descriptive-name
   ```

4. **Create PR** to `master`:
   ```bash
   gh pr create --base master --head feature/descriptive-name
   ```

5. **Merge** after approval (squash or merge commit)

### Hotfix Workflow

```
master ──────────────────────────────► master
         \                           /
          └── hotfix/critical-fix ──┘
                    (fast-tracked)
```

1. Create from `master`: `git checkout -b hotfix/issue-description`
2. Fix the issue with minimal changes
3. Create PR with `[HOTFIX]` prefix in title
4. Request expedited review
5. Merge immediately after approval

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (deps, build, etc.) |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

### Scopes (Avika-specific)

| Scope | Component |
|-------|-----------|
| `agent` | nginx-agent code |
| `gateway` | Gateway server |
| `frontend` | Frontend/UI |
| `helm` | Helm charts |
| `proto` | Protocol buffers |
| `clickhouse` | ClickHouse/database |
| `grafana` | Grafana dashboards |
| `rbac` | Access control |

### Examples

```bash
# Feature
git commit -m "feat(agent): add VTS metrics collection"

# Bug fix
git commit -m "fix(gateway): resolve ClickHouse connection timeout"

# Documentation
git commit -m "docs(helm): update installation instructions"

# Refactor
git commit -m "refactor(frontend): simplify dashboard components"
```

## Branch Naming Convention

```
<type>/<short-description>
```

### Rules

- Use lowercase
- Use hyphens (not underscores)
- Keep it short but descriptive
- Include issue number if applicable

### Examples

```
feature/multi-tenancy-rbac
fix/dashboard-data-flow
hotfix/agent-crash-on-startup
docs/api-documentation
refactor/clickhouse-queries
feature/issue-42-user-auth
```

## AI Agent Guidelines

When AI agents (Cursor, Codex, etc.) work on this repository:

### DO

- Always create a feature branch for changes
- Follow the commit message convention
- Create PRs for all changes to protected branches
- Use descriptive branch names
- Squash related commits before PR

### DON'T

- Never commit directly to `master` or `main`
- Never force push to protected branches
- Never include AI tool names in commits or PR descriptions
- Never create branches with date-based names (e.g., `2024-01-15-fix`)

### Author Configuration

Always use the project author for commits:
```bash
git commit --author="hellodk <hello.dk@outlook.com>"
```

## PR Requirements

### Before Creating PR

- [ ] Branch is up to date with `master`
- [ ] All tests pass locally
- [ ] Linting passes
- [ ] Commit messages follow convention
- [ ] No secrets or credentials in code

### PR Template

```markdown
## Summary
Brief description of changes

## Changes
- List of specific changes

## Test Plan
- [ ] Test case 1
- [ ] Test case 2

## Related Issues
Closes #XX
```

## Version Tagging

After merging significant features or releases:

```bash
# Semantic versioning: MAJOR.MINOR.PATCH
git tag -a v0.1.85 -m "Release v0.1.85: Multi-tenancy support"
git push origin v0.1.85
```

## Quick Reference

```bash
# Start new feature
git checkout master && git pull
git checkout -b feature/my-feature

# Daily workflow
git add -A
git commit -m "feat(scope): what I did"
git push origin feature/my-feature

# Create PR
gh pr create --base master

# Update branch with master
git fetch origin
git rebase origin/master

# After PR merged, cleanup
git checkout master && git pull
git branch -d feature/my-feature
```

## Branch Cleanup

Branches should be deleted after merging:

```bash
# Delete local branch
git branch -d feature/merged-branch

# Delete remote branch (automatic with PR merge)
git push origin --delete feature/merged-branch
```

---

*Last updated: February 2026*
