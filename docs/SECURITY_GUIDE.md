# Security & Safe Push Guide

## 🔒 Automated Security Checks

I've set up comprehensive security checks to prevent accidentally committing sensitive data to GitHub.

### What Was Installed

1. **Pre-commit Hook** (`.git/hooks/pre-commit`)
   - Runs automatically before every commit
   - Scans for sensitive patterns
   - Blocks commits containing secrets

2. **Safe Push Script** (`scripts/safe-push.sh`)
   - Interactive push with confirmation
   - Additional security scans
   - Shows what will be pushed

3. **Enhanced .gitignore**
   - Excludes all common sensitive files
   - Prevents accidental commits

---

## 🚀 How to Use

### Quick Start (Recommended)

```bash
# Use the safe push script
./scripts/safe-push.sh "feat: add new feature"
```

This will:
1. ✅ Stage all changes
2. ✅ Run security checks
3. ✅ Commit with your message
4. ✅ Show what will be pushed
5. ✅ Ask for confirmation
6. ✅ Push to GitHub

### Manual Workflow

```bash
# 1. Stage changes
git add .

# 2. Commit (pre-commit hook runs automatically)
git commit -m "feat: your message here"

# 3. Push
git push origin main
```

---

## 🛡️ What Gets Checked

### 1. Sensitive Data Patterns

The pre-commit hook scans for:

- **API Keys & Tokens**
  - AWS access keys (AKIA...)
  - Docker Hub tokens (dckr_pat_...)
  - GitHub tokens (ghp_..., gho_...)
  - Generic API keys

- **Credentials**
  - Database connection strings
  - Passwords
  - Private keys (RSA, SSH, etc.)
  - JWT tokens

- **Cloud Provider Secrets**
  - AWS credentials
  - GCP service accounts
  - Azure credentials

### 2. Sensitive Files

Blocks commits of:
- `.env` files
- `*.pem`, `*.key` files
- `credentials.json`
- `secrets.yaml`
- SSH keys (`id_rsa`, etc.)

### 3. Large Files

Warns about files > 10MB (should use Git LFS)

### 4. Hardcoded IPs

Warns about private IP addresses in code

### 5. Security TODOs

Flags comments like:
- `TODO: fix security issue`
- `FIXME: password hardcoded`

---

## 📋 Example Output

### ✅ Successful Commit

```
🔍 Running security checks...
Checking for sensitive data patterns...
Checking for sensitive files...
Checking for large files...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All security checks passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### ❌ Blocked Commit

```
🔍 Running security checks...
✗ Potential sensitive data found in: config.yaml
  Pattern: api[_-]?key['\"]?\s*[:=]\s*['\"][a-zA-Z0-9_-]{20,}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ COMMIT BLOCKED: Sensitive data detected!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remove sensitive data before committing.

Tips:
  • Use environment variables for secrets
  • Add sensitive files to .gitignore
  • Use GitHub Secrets for CI/CD credentials
```

---

## 🔧 Configuration

### Bypass Security Check (NOT RECOMMENDED)

Only use this if you're absolutely sure:

```bash
git commit --no-verify -m "message"
```

### Add Custom Patterns

Edit `.git/hooks/pre-commit` and add to `SENSITIVE_PATTERNS` array:

```bash
SENSITIVE_PATTERNS=(
    # ... existing patterns ...
    "your-custom-pattern"
)
```

### Disable Hook Temporarily

```bash
# Rename the hook
mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled

# Re-enable later
mv .git/hooks/pre-commit.disabled .git/hooks/pre-commit
```

---

## 📝 Best Practices

### ✅ DO:

1. **Use Environment Variables**
   ```bash
   # .env (gitignored)
   DATABASE_URL=postgres://user:pass@localhost/db
   API_KEY=your-secret-key
   ```

2. **Use GitHub Secrets**
   - For CI/CD credentials
   - Repository Settings → Secrets

3. **Use the Safe Push Script**
   ```bash
   ./scripts/safe-push.sh "feat: new feature"
   ```

4. **Review Changes Before Committing**
   ```bash
   git diff
   git status
   ```

### ❌ DON'T:

1. **Don't hardcode secrets**
   ```javascript
   // BAD
   const apiKey = "sk_live_abc123...";
   
   // GOOD
   const apiKey = process.env.API_KEY;
   ```

2. **Don't commit .env files**
   - Already in .gitignore
   - Use .env.example instead

3. **Don't bypass security checks**
   - Unless absolutely necessary
   - Document why if you must

4. **Don't commit credentials**
   - Use secret management tools
   - Use GitHub Secrets for CI/CD

---

## 🚨 If You Accidentally Committed Secrets

### 1. Remove from Latest Commit

```bash
# Remove file from git (keep local copy)
git rm --cached path/to/secret/file

# Amend the commit
git commit --amend --no-edit

# Force push (if already pushed)
git push --force origin main
```

### 2. Remove from History

```bash
# Use BFG Repo-Cleaner or git-filter-repo
# See: https://rtyley.github.io/bfg-repo-cleaner/
```

### 3. Rotate Credentials

⚠️ **IMPORTANT**: If secrets were pushed to GitHub:
1. Immediately rotate/revoke the exposed credentials
2. Generate new secrets
3. Update your systems with new credentials
4. Consider the data compromised

---

## 🔍 Additional Tools

### Install git-secrets (Optional)

```bash
# macOS
brew install git-secrets

# Configure
git secrets --install
git secrets --register-aws
```

### Install detect-secrets (Optional)

```bash
pip install detect-secrets

# Scan repository
detect-secrets scan
```

---

## 📚 Related Documentation

- `docs/GITHUB_SECRETS_SETUP.md` - Setting up GitHub Secrets
- `docs/VERSIONING_GUIDE.md` - CI/CD and versioning
- `.gitignore` - Files excluded from git

---

## 🎯 Quick Commands

```bash
# Safe push (recommended)
./scripts/safe-push.sh "your commit message"

# Check what would be committed
git status
git diff --cached

# Test pre-commit hook manually
.git/hooks/pre-commit

# View git log
git log --oneline -10

# Undo last commit (keep changes)
git reset --soft HEAD~1
```

---

## ✅ Checklist Before Pushing

- [ ] Reviewed changes with `git diff`
- [ ] No sensitive data in files
- [ ] .env files not tracked
- [ ] Commit message follows conventions
- [ ] Pre-commit hook passed
- [ ] Ready to push to GitHub

---

**Remember**: Prevention is better than cleanup. These tools help catch mistakes before they become security incidents! 🔒
