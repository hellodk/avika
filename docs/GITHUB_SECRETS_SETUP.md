# Step-by-Step Guide: Setting Up GitHub Secrets for Docker Hub

## Prerequisites

1. A GitHub account with access to your repository
2. A Docker Hub account (free tier is fine)

---

## Part 1: Create Docker Hub Access Token

### Step 1: Log in to Docker Hub
1. Go to https://hub.docker.com
2. Click **Sign In** (top right)
3. Enter your credentials

### Step 2: Navigate to Security Settings
1. Click on your **username** (top right corner)
2. Select **Account Settings** from dropdown
3. Click on **Security** in the left sidebar

### Step 3: Create New Access Token
1. Scroll down to **Access Tokens** section
2. Click **New Access Token** button
3. Fill in the form:
   - **Description**: `GitHub Actions - NGINX Manager` (or any descriptive name)
   - **Access permissions**: Select **Read, Write, Delete** (or **Read & Write** if that's the only option)
4. Click **Generate**

### Step 4: Copy the Token
⚠️ **IMPORTANT**: Copy the token immediately! You won't be able to see it again.

```
Example token: dckr_pat_1234567890abcdefghijklmnopqrstuvwxyz
```

Keep this token safe - you'll need it in the next part.

---

## Part 2: Add Secrets to GitHub Repository

### Step 1: Navigate to Your Repository
1. Go to https://github.com
2. Navigate to your `nginx-manager` repository
3. Make sure you're on the main page of the repository

### Step 2: Open Settings
1. Click on **Settings** tab (top navigation bar)
   - If you don't see Settings, you may not have admin access to the repository

### Step 3: Navigate to Secrets
1. In the left sidebar, look for **Security** section
2. Click on **Secrets and variables**
3. Click on **Actions**

### Step 4: Add DOCKERHUB_TOKEN Secret
1. Click the **New repository secret** button (green button, top right)
2. Fill in the form:
   - **Name**: `DOCKERHUB_TOKEN` (must be exactly this)
   - **Secret**: Paste the access token you copied from Docker Hub
3. Click **Add secret**

### Step 5: Verify Secrets
You should now see the secret listed:
- ✅ `DOCKERHUB_TOKEN`

The value will be hidden (shown as `***`), which is correct for security.

**Note:** Workflows use `DOCKERHUB_USERNAME` from the workflow env (default `hellodk`). To push to a different Docker Hub account, add a repository secret `DOCKERHUB_USERNAME` and reference it in the workflow files.

---

## Part 3: Test the Setup

### Option A: Trigger Automatic Build (Recommended)

1. **Build on every merge:** Push to `master` or `main`:
   - **Build on Merge** workflow runs and pushes images with tags `latest` and `sha-<short-sha>`.

2. **Build on PR:** Open a pull request targeting `master` or `main`:
   - **Build on PR** workflow runs and pushes images with tags `pr-<number>` and `sha-<short-sha>` (for QA testing).

3. **Full release (version bump + GitHub Release):** Push to `master`/`main` with conventional commits (`feat:`, `fix:`, etc.) or merge a PR:
   - **Release** workflow analyzes commits; if releasable, it bumps version, pushes versioned images and `latest`, and creates a GitHub Release.

4. Watch builds:
   - Go to your repository on GitHub → **Actions** tab
   - Click a workflow run to watch progress

### Option B: Manual Release

1. Go to your repository on GitHub → **Actions** tab
2. Select **Release** workflow (left sidebar)
3. Click **Run workflow**, choose branch `master` or `main`
4. Select bump type: `auto`, `patch`, `minor`, or `major`
5. (Optional) Enter a prerelease suffix (e.g. `rc.1`)
6. Click **Run workflow**

---

## Troubleshooting

### "Settings tab not visible"
- You need admin/owner access to the repository
- Ask the repository owner to add the secrets or grant you admin access

### "Workflow failed: authentication required"
- Ensure the repository secret is named exactly `DOCKERHUB_TOKEN`
- Verify the Docker Hub token hasn't expired and has **Read, Write, Delete** (or Read & Write) permissions
- Make sure you copied the entire token (they can be quite long)

### "Permission denied" when pushing
- Your Docker Hub token needs **Write** permissions
- Regenerate the token with correct permissions

---

## Quick Reference

### GitHub Secrets Location
```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

### Required Secrets
| Name | Value | Example |
|------|-------|---------|
| `DOCKERHUB_TOKEN` | Docker Hub access token | `dckr_pat_abc123...` |

### Workflow Files
```
.github/workflows/ci.yml              # Lint, test, Docker build test (no push)
.github/workflows/build-on-merge.yml  # Build & push on push to master/main (latest, sha-*)
.github/workflows/build-on-pr.yml    # Build & push on PR (pr-*, sha-*)
.github/workflows/release.yml        # Version bump, release, versioned images (on releasable commits or manual)
```

---

## What Happens After Setup?

- **Push to `master` or `main`:** **Build on Merge** runs and pushes gateway, frontend, and agent images with tags `latest` and `sha-<short-sha>`.
- **Pull request to `master`/`main`:** **Build on PR** runs and pushes images with tags `pr-<number>` and `sha-<short-sha>` for testing.
- **Push with releasable commits** (e.g. `feat:`, `fix:`, or merge commit): **Release** runs, bumps version, pushes versioned images and creates a GitHub Release.
- **Manual:** Run **Release** from the Actions tab with a chosen bump type.

You can monitor progress in the **Actions** tab.

---

## Security Notes

✅ **DO:**
- Use access tokens (not your password)
- Enable 2FA on Docker Hub
- Use descriptive token names
- Rotate tokens periodically

❌ **DON'T:**
- Share your access token
- Commit tokens to code
- Use your Docker Hub password
- Give tokens more permissions than needed

---

## Need Help?

If you encounter issues:
1. Check the **Actions** tab for error messages
2. Verify secrets are set correctly (Settings → Secrets)
3. Ensure Docker Hub token has write permissions
4. Check that your Docker Hub account is active

For more details, see: `docs/VERSIONING_GUIDE.md`
