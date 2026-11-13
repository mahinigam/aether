# Git History Purge & Credential Rotation Procedure

## 1. Executive Summary & Purpose

In Git, deleting a file from the repository HEAD (`git rm`) removes the file from future commits, but leaves the entire file content and blob intact in the historical object graph (`.git/objects/pack/`). Anyone who clones or forks the repository can inspect previous commits and extract past files or secrets.

During security audits of the Aether repository (including Gitleaks and automated secret scanning), three historical exposures were identified in earlier commits prior to PR #2 and PR #4.

This document details:
1. The exact inventory of historical exposures.
2. The immediate containment steps already executed at the repository tip.
3. The step-by-step procedure for a permanent history rewrite using `git-filter-repo`.
4. The mandatory credential rotation and contributor synchronization runbook.

---

## 2. Historical Exposure Inventory

| Commit SHA | Date | File Path | Rule ID / Description | Status in HEAD |
|---|---|---|---|---|
| `6e99235a2821` | 2026-01-10 | `nginx/certs/nginx.key` | `private-key` (RSA private key) | Removed in PR #2; local cert generation script added |
| `458ce47ceda8` | 2026-01-07 | `k8s/config.yaml` | `generic-api-key` (Base64 placeholder `eW91ci1zdXBlci...`) | Sanitized in PR #5 to non-secret placeholder |
| `3db307cec453` | 2025-11-21 | `load-test.yml` | `jwt` (Sample JWT token) | File removed in PR #2 |

---

## 3. Immediate Containment (Current Repository State)

1. **HEAD Sanitization**: None of the above files or values exist in the current working tree or branch tip (`master`).
2. **Local Development Certificates**: Certificates and keys are no longer tracked. A reproducible generator script (`scripts/generate-dev-cert.sh`) generates self-signed certificates into `.gitignore`-protected paths (`nginx/certs/*.crt`, `nginx/certs/*.key`).
3. **Environment Security**: All development secrets in `.env.example`, `backend/.env.example`, and `k8s/config.yaml` use explicit dummy placeholders (`REPLACE_WITH_...`) or prompt the operator to run `openssl rand -hex 32`.
4. **Automated Scanning Enforcement**: A `.gitleaksignore` file records the three historical commit fingerprints. Active CI and local pre-commit scanning enforce zero tolerance for any *new* secrets.

---

## 4. Credential Invalidation & Revocation Checklist

Before or during any Git history rewrite, all potentially exposed credentials must be treated as permanently compromised:

- [ ] **TLS Certificates**: Verify that no production, staging, or intranet server uses the RSA key committed in `6e99235a`. Any certificate signed with that key must be revoked via CRL / OCSP and replaced with a newly generated keypair.
- [ ] **JWT Secrets**: Invalidate and rotate all `JWT_SECRET` keys across all staging and production deployments.
- [ ] **Session Purge**: Flush active refresh tokens stored in Redis (`redis-cli flushdb` or selective deletion of `refresh_token:*` keys) to force all clients to re-authenticate with credentials signed by the new secret.
- [ ] **Third-Party API Keys**: Verify that no operational API keys (Spotify, Giphy, OpenWeather, Turn/Stun) match any strings committed in historical branches or PRs.

---

## 5. Permanent History Purge Protocol (`git-filter-repo`)

> [!CAUTION]
> Rewriting Git history changes the commit SHA of every commit downstream of the edited commit.
> This requires a coordinated force-push to `origin/master`, temporary relaxation of GitHub branch protection rules, and mandatory re-cloning by all contributors.

### Prerequisites
- Install `git-filter-repo` (Python 3 based):
  ```bash
  # macOS
  brew install git-filter-repo

  # Linux (Ubuntu/Debian)
  sudo apt-get install git-filter-repo
  # or
  pip install git-filter-repo
  ```
- Administrator access to `https://github.com/mahinigam/aether` to temporarily allow force pushes on protected branches.

---

### Step-by-Step Execution Runbook

#### Step 1: Pre-flight Backup
Create a standalone bare mirror backup of the repository in its current state.
```bash
git clone --mirror https://github.com/mahinigam/aether.git aether-backup-$(date +%Y%m%d).git
tar -czf aether-backup-$(date +%Y%m%d).tar.gz aether-backup-$(date +%Y%m%d).git
```
Store this archive securely offline.

#### Step 2: Fresh Mirror for Filtering
Create a separate clean mirror specifically for the purge operation:
```bash
git clone --mirror https://github.com/mahinigam/aether.git aether-filter.git
cd aether-filter.git
```

#### Step 3: Run `git-filter-repo`
Remove all instances of the sensitive files across all commits, tags, and branches:
```bash
git-filter-repo --invert-paths \
  --path nginx/certs/nginx.key \
  --path nginx/certs/nginx.crt \
  --path load-test.yml
```

#### Step 4: Verify the Purged History
Scan the filtered repository with Gitleaks to confirm zero leaks remain:
```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest detect --source="/repo" --verbose
```
Expected output: `no leaks found` (without needing `.gitleaksignore`).

#### Step 5: Clean Up Remote and Re-link
`git-filter-repo` strips remote definitions as a safeguard to prevent accidental pushes. Re-add the remote:
```bash
git remote add origin https://github.com/mahinigam/aether.git
```

#### Step 6: Coordinated Force Push
1. In GitHub Repository Settings -> Branches:
   - Temporarily uncheck "Require linear history" and enable "Allow force pushes" for administrators.
2. Force-push all rewritten branches and tags:
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```
3. In GitHub Repository Settings:
   - Immediately re-enable branch protections and disable force pushes.

---

## 6. Contributor & Collaborator Instructions

Because commit SHAs will have changed:
1. **DO NOT** run `git pull` on existing local clones. Doing so will merge the old and new histories, resurrecting the purged commits.
2. Every team member must back up any uncommitted work:
   ```bash
   git diff > ~/my-uncommitted-changes.patch
   ```
3. Delete the old local repository directory:
   ```bash
   cd ..
   rm -rf aether
   ```
4. Clone the repository fresh from GitHub:
   ```bash
   git clone https://github.com/mahinigam/aether.git
   cd aether
   ```
5. Apply any uncommitted changes:
   ```bash
   git apply ~/my-uncommitted-changes.patch
   ```

---

## 7. Audit & Verification Trail

### 7.1 Execution Record (Completed 2026-11-13)
- **Protocol**: `git-filter-repo` (v2.47.0) executed with path inversion and secret token sanitization:
  - Inverted paths: `nginx/certs/nginx.key`, `nginx/certs/nginx.crt`, `load-test.yml`
  - Sanitized historical Base64 JWT token placeholder in `k8s/config.yaml` (`eW91ci...` -> `"REPLACE_WITH_SECURE_JWT_SECRET"`)
- **Status of `.gitleaksignore`**: Permanently deleted. The repository requires zero exceptions or ignores.
- **Verification Scan**: `gitleaks detect --verbose` executed across all commits in repository history.
  - **Verdict**: 0 secret leaks found across 100% of commits.
- **Upstream Convergence**: Remote origin synchronized via coordinated force-push (`git push origin --force master --tags`).
