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

### Step 4: Add DOCKER_USERNAME Secret
1. Click the **New repository secret** button (green button, top right)
2. Fill in the form:
   - **Name**: `DOCKER_USERNAME` (must be exactly this)
   - **Secret**: Your Docker Hub username (e.g., `johndoe`)
3. Click **Add secret**

### Step 5: Add DOCKER_PASSWORD Secret
1. Click **New repository secret** again
2. Fill in the form:
   - **Name**: `DOCKER_PASSWORD` (must be exactly this)
   - **Secret**: Paste the access token you copied from Docker Hub
3. Click **Add secret**

### Step 6: Verify Secrets
You should now see two secrets listed:
- ✅ `DOCKER_USERNAME`
- ✅ `DOCKER_PASSWORD`

The values will be hidden (shown as `***`), which is correct for security.

---

## Part 3: Test the Setup

### Option A: Trigger Automatic Build (Recommended)

1. Make a small change to your code:
   ```bash
   cd /home/dk/Documents/git/nginx-manager
   
   # Make a small change
   echo "# CI/CD enabled" >> README.md
   
   # Commit with semantic versioning message
   git add README.md
   git commit -m "feat: enable automated Docker builds"
   
   # Push to GitHub
   git push origin main
   ```

2. Watch the build:
   - Go to your repository on GitHub
   - Click on **Actions** tab
   - You should see a new workflow run starting
   - Click on it to watch the progress

### Option B: Manual Trigger

1. Go to your repository on GitHub
2. Click on **Actions** tab
3. Click on **Build and Push Agent** workflow (left sidebar)
4. Click **Run workflow** button (right side)
5. Select:
   - Branch: `main`
   - Version bump type: `patch`
6. Click **Run workflow**

---

## Troubleshooting

### "Settings tab not visible"
- You need admin/owner access to the repository
- Ask the repository owner to add the secrets or grant you admin access

### "Workflow failed: authentication required"
- Double-check that secret names are exactly `DOCKER_USERNAME` and `DOCKER_PASSWORD`
- Verify the Docker Hub token hasn't expired
- Make sure you copied the entire token (they can be quite long)

### "Repository not found" error
- Update the image name in `.github/workflows/agent-build.yml`:
  ```yaml
  env:
    REGISTRY: docker.io
    IMAGE_NAME: nginx-manager-agent  # Change this if needed
  ```

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
| `DOCKER_USERNAME` | Your Docker Hub username | `johndoe` |
| `DOCKER_PASSWORD` | Docker Hub access token | `dckr_pat_abc123...` |

### Workflow File Location
```
.github/workflows/agent-build.yml
```

---

## What Happens After Setup?

Once secrets are configured, every push to `main` branch will:

1. ✅ Detect version bump from commit message
2. ✅ Build Docker image with version metadata
3. ✅ Push to Docker Hub with multiple tags
4. ✅ Create GitHub release
5. ✅ Update VERSION file

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
