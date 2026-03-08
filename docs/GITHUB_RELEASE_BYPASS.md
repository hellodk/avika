# Release workflow: branch rule bypass

If the **Release** workflow fails at the **Bump Version** step with:

```text
remote: error: GH013: Repository rule violations found for refs/heads/master.
remote: - Changes must be made through a pull request.
! [remote rejected] HEAD -> master (push declined due to repository rule violations)
```

the default branch is protected so that **all changes must go through a pull request**. The release job pushes the version-bump commit directly, so that push is rejected.

## Fix: allow the Actions bot to bypass the rule

1. Open the repo on GitHub → **Settings** → **Rules** → **Rulesets**.
2. Open the ruleset that applies to your default branch (e.g. `master` or `main`).
3. Find the rule that enforces “Require a pull request before merging” (or “Changes must be made through a pull request”).
4. Edit the rule and add a **Bypass list** (or “Allow specified actors to bypass”).
5. Add **`github-actions[bot]`** to the bypass list and save.

After that, the Release workflow can push the version-bump commit and tag to the default branch, and the job should succeed.

## Optional: use a PAT

You can use a Personal Access Token in the **RELEASE_TOKEN** secret instead of the default `GITHUB_TOKEN`. The same branch rules still apply: if the rule has no bypass, the push will still be rejected. Adding `github-actions[bot]` to the bypass list is what allows the push; the token only affects authentication.
