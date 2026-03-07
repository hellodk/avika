# Branch protection (permanent branches)

**Protected branches:** `main`, `master`, `uat`, `develop`

- Merge only via pull requests (no direct push to these branches).
- Deletion of the branch is disabled.
- Force push is disabled.
- Rules apply to administrators as well.

**Note:** `main` does not exist on the remote yet. When you create it, apply the same protection:

```bash
gh api -X PUT repos/hellodk/avika/branches/main/protection -H "Accept: application/vnd.github+json" --input .github/branch-protection-payload.json
```

All other branches are non-permanent: push to GitHub, open a PR (e.g. to `develop`), and delete the branch locally after the PR is merged or no longer needed.
