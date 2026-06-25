# Setup Guide — db-backup-server

Complete guide: rclone config, env setup, local dev, Docker, Coolify deploy.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [How It Works](#how-it-works)
3. [Step 1: Rclone Config](#step-1-rclone-config)
4. [Step 2: SMTP App Password (Gmail)](#step-2-smtp-app-password-gmail)
5. [Step 3: Environment Variables](#step-3-environment-variables)
6. [Step 4: Local Development](#step-4-local-development)
7. [Step 5: Docker Compose (Local Test)](#step-5-docker-compose-local-test)
8. [Step 6: Coolify Deploy](#step-6-coolify-deploy)
9. [Step 7: Verify Everything](#step-7-verify-everything)
10. [Troubleshooting](#troubleshooting)
11. [All Env Variables Reference](#all-env-variables-reference)

---

## Prerequisites

- Node.js 20+
- pnpm (or npm)
- PostgreSQL database (local or remote)
- Google Drive account
- SMTP credentials (Gmail works)

---

## How It Works

```
Cron schedule triggers (or --now flag)
    │
    ▼
pg_dump → gzip → temp local .sql.gz file
    │
    ▼
rclone copyto → Google Drive (checksum + verify)
    │
    ▼
Delete old remote backups (keep latest)
    │
    ▼
Delete local temp file
    │
    ▼
Send email report (success or failure)
```

Startup sequence (every time):

```
validateEnv() → setupRclone() → startBackupCron()
```

`setupRclone()` decodes `RCLONE_CONFIG_BASE64` and writes `~/.config/rclone/rclone.conf`. Same code on macOS, Linux, Docker, Coolify, Kubernetes.

---

## Step 1: Rclone Config

### 1a. Install rclone

```bash
# macOS
brew install rclone

# Linux
sudo apt install rclone   # or: curl https://rclone.org/install.sh | sudo bash
```

### 1b. Create a Google Drive remote

```bash
rclone config
```

Interactive prompts — answer like this:

```
n) New remote
name> gdrive
Type of storage> drive   (type "drive" and press Enter)
client_id>               (press Enter — use default)
client_secret>           (press Enter — use default)
scope> 1                 (full access)
root_folder_id>          (press Enter — use default)
service_account_file>    (press Enter — skip)
Edit advanced config?> n (No)
Use auto config?> y      (Yes — opens browser for Google OAuth)
```

A browser opens → sign in with your Google account → grant access.

Back in terminal:

```
Keep this "gdrive" remote?> y (Yes)
q) Quit config
```

### 1c. Verify rclone works

```bash
rclone listremotes
# Output: gdrive:

rclone lsd gdrive:
# Shows your Google Drive folders
```

### 1d. Create a backup folder (optional)

```bash
rclone mkdir gdrive:DatabaseBackups
```

### 1e. Base64 encode the config

```bash
# macOS
base64 -i ~/.config/rclone/rclone.conf | tr -d '\n'

# Linux
base64 -w0 ~/.config/rclone/rclone.conf
```

Copy the entire output string. This is your `RCLONE_CONFIG_BASE64`.

**What the config file looks like:**

```ini
[gdrive]
type = drive
scope = drive
token = {"access_token":"ya29...","token_type":"Bearer","refresh_token":"1//...","expiry":"2026-06-26T..."}
```

---

## Step 2: SMTP App Password (Gmail)

If you want email alerts:

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select app: **Mail**, device: **Other** → name it `db-backup`
5. Click **Generate** → copy the 16-character password

```
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop    ← this, without spaces
```

For Mailgun/Brevo/SES — swap `SMTP_HOST` and `SMTP_PORT` accordingly.

---

## Step 3: Environment Variables

### Minimal `.env` (backup only, no email)

```bash
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=postgres
DB_PASSWORD=your_password

# Rclone
RCLONE_CONFIG_BASE64=<paste from step 1e>
RCLONE_REMOTE=gdrive
RCLONE_FOLDER=DatabaseBackups
```

### Full `.env` (backup + email)

```bash
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=postgres
DB_PASSWORD=your_password

# Backup directory (default: /app/backups)
BACKUP_DIR=/app/backups

# Rclone
RCLONE_CONFIG_BASE64=<paste from step 1e>
RCLONE_REMOTE=gdrive
RCLONE_FOLDER=DatabaseBackups

# SMTP Email Alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=yourapppassword
ALERT_EMAIL=alerts@example.com

# Cron (default: daily at 2 AM)
BACKUP_CRON_SCHEDULE=0 2 * * *

# App
NODE_ENV=production
LOG_LEVEL=info
```

### Where to get each value

| Variable | Source |
|---|---|
| `DB_HOST` | Database hosting dashboard or server IP |
| `DB_PORT` | Usually `5432` |
| `DB_NAME` | Your database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `RCLONE_CONFIG_BASE64` | Step 1e above |
| `RCLONE_REMOTE` | Whatever you named it in `rclone config` (default: `gdrive`) |
| `RCLONE_FOLDER` | Folder path in Google Drive (no trailing slash) |
| `SMTP_HOST` | `smtp.gmail.com` or your provider |
| `SMTP_PORT` | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Step 2 above — Google App Password |
| `ALERT_EMAIL` | Where to send reports |
| `BACKUP_CRON_SCHEDULE` | [crontab.guru](https://crontab.guru) |
| `NODE_ENV` | `production` or `development` |
| `LOG_LEVEL` | `info`, `debug`, `warn`, `error` |

---

## Step 4: Local Development

```bash
cd db-backup-server

# Install dependencies
pnpm install

# Copy and edit .env
cp .env.example .env
# Fill in your .env values

# Run a single backup (runs once, then exits)
pnpm backup

# Run the cron scheduler (keeps running, backs up on schedule)
pnpm dev
```

**What you should see on success:**

```
[INFO] Starting db-backup-server in development mode
[INFO] Environment validation passed.
[INFO] rclone config written to /Users/.../.config/rclone/rclone.conf
[INFO] Running immediate backup (--now flag detected)...
[INFO] Starting PostgreSQL backup...
[INFO] Backup created: /app/backups/backup-mydb-2026-06-26T02-00-00.sql.gz (12.4 MB)
[INFO] Uploading backup-mydb-... via rclone to gdrive:DatabaseBackups...
[INFO] Uploaded: gdrive:DatabaseBackups/backup-mydb-...
[INFO] Local backup deleted.
[INFO] Backup pipeline completed successfully.
[INFO] Backup report email sent.
[INFO] Scheduling backup cron: 0 2 * * *
[INFO] db-backup-server is running.
```

**Check your Google Drive** — the backup file should be in the `DatabaseBackups` folder.

---

## Step 5: Docker Compose (Local Test)

The `docker-compose.yml` includes a PostgreSQL test database + the backup server.

```bash
# 1. Create .env with DB_HOST=postgres (compose service name)
cat > .env << 'EOF'
DB_HOST=postgres
DB_PORT=5432
DB_NAME=backup_test
DB_USER=postgres
DB_PASSWORD=postgres
RCLONE_CONFIG_BASE64=<your-base64>
RCLONE_REMOTE=gdrive
RCLONE_FOLDER=DatabaseBackups
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=yourapppassword
ALERT_EMAIL=you@gmail.com
BACKUP_CRON_SCHEDULE=0 2 * * *
EOF

# 2. Build and start
docker compose up --build -d

# 3. Check logs
docker compose logs -f backup

# 4. Trigger a backup
docker exec db-backup-server node dist/index.js --now

# 5. Verify rclone inside container
docker exec db-backup-server rclone listremotes
# Output: gdrive:

docker exec db-backup-server rclone lsd gdrive:
# Output: DatabaseBackups/
```

---

## Step 6: Coolify Deploy

### 6a. Prepare your env vars

In Coolify, add these environment variables to your service:

```
DB_HOST=<your-production-db-host>
DB_PORT=5432
DB_NAME=<your-db-name>
DB_USER=<your-db-user>
DB_PASSWORD=<your-db-password>
RCLONE_CONFIG_BASE64=<from-step-1e>
RCLONE_REMOTE=gdrive
RCLONE_FOLDER=DatabaseBackups
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=yourapppassword
ALERT_EMAIL=you@gmail.com
BACKUP_CRON_SCHEDULE=0 2 * * *
NODE_ENV=production
LOG_LEVEL=info
```

### 6b. Build settings

- **Build pack**: Dockerfile
- **Dockerfile path**: `db-backup-server/Dockerfile` (or root if deploying only this)
- **Port**: none (it's a cron job, no HTTP server)

### 6c. Deploy

Coolify will:
1. Build the Docker image
2. Start the container
3. `validateEnv()` runs → checks required vars
4. `setupRclone()` runs → decodes `RCLONE_CONFIG_BASE64` → writes `/root/.config/rclone/rclone.conf`
5. `startBackupCron()` runs → schedules backup cron

No manual rclone config. No bash scripts. No host mounts. Fully self-contained.

### 6d. Verify on Coolify

SSH into the container or use Coolify's terminal:

```bash
rclone listremotes
# gdrive:

rclone lsd gdrive:
# DatabaseBackups/

node dist/index.js --now
# Runs one backup immediately
```

---

## Step 7: Verify Everything

Run this checklist:

```bash
# 1. Rclone can see Google Drive
rclone lsd gdrive:

# 2. Env vars are loaded
node -e "require('dotenv').config(); console.log(process.env.DB_NAME)"

# 3. Single backup works
pnpm backup

# 4. File exists in Google Drive
rclone ls gdrive:DatabaseBackups

# 5. Email arrives (check inbox)

# 6. Cron is scheduled
# Look for: "Scheduling backup cron: 0 2 * * *" in logs

# 7. Local temp file deleted after upload
# Should see: "Local backup deleted" in logs
```

---

## Restore a Backup

### Download from Google Drive

```bash
# List backups in remote
rclone ls gdrive:DatabaseBackups

# Download a specific backup
rclone copy gdrive:DatabaseBackups/backup-mydb-2026-06-26T02-00-00.sql.gz ./backups/
```

### Restore to database

```bash
# Build first (if not already)
pnpm build

# Restore
pnpm restore backups/backup-mydb-2026-06-26T02-00-00.sql.gz

# Or during development (no build needed)
pnpm restore:dev backups/backup-mydb-2026-06-26T02-00-00.sql.gz
```

### What happens during restore

| Step | Description |
|---|---|
| 1. File check | Verifies file exists and is `.sql.gz` |
| 2. Integrity check | `gzip -t` — verifies archive not corrupted |
| 3. Restore | `gunzip -c \| psql` — pipe into database with `--single-transaction` + `ON_ERROR_STOP=1` |

If any step fails, the entire restore rolls back (single transaction). Production database stays untouched.

### Restore via Docker

```bash
# Copy backup into container
docker cp backup.sql.gz db-backup-server:/app/backups/

# Run restore
docker exec db-backup-server node dist/restore/restore.js /app/backups/backup.sql.gz
```

---

## Troubleshooting

### "RCLONE_CONFIG_BASE64 not set"

You didn't add it to `.env`. Run step 1e and add the value.

### "rclone upload failed: Failed to create file system for 'gdrive:'"

The base64 config is malformed. Check:

```bash
echo "$RCLONE_CONFIG_BASE64" | base64 -d
# Should output valid rclone.conf content
```

### "Missing required env vars: DB_HOST, DB_NAME..."

Check your `.env` file — one or more required vars are empty.

### "Invalid login: 535 Authentication failed"

Gmail SMTP: make sure you're using an **App Password**, not your regular Gmail password. See Step 2.

### "pg_dump: not found"

Install PostgreSQL client tools:

```bash
# macOS
brew install postgresql@16

# Alpine (in Docker, already handled by Dockerfile)
apk add postgresql-client
```

### Google OAuth token expired

Rclone refresh tokens don't expire (unless revoked). If you get auth errors:

1. Go to [Google Account → Security → Third-party apps](https://myaccount.google.com/security)
2. Check "rclone" still has access
3. If revoked, re-run `rclone config` → edit `gdrive` → re-auth
4. Re-encode: `base64 -i ~/.config/rclone/rclone.conf | tr -d '\n'`
5. Update `RCLONE_CONFIG_BASE64` in `.env` or Coolify

### Backup runs but file doesn't appear in Drive

Check the remote folder name is correct. `rclone lsd gdrive:` to list folders. The folder must already exist in Google Drive.

---

## All Env Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DB_PORT` | Yes | `5432` | PostgreSQL port |
| `DB_NAME` | Yes | — | Database name |
| `DB_USER` | Yes | — | Database user |
| `DB_PASSWORD` | Yes | — | Database password |
| `RCLONE_CONFIG_BASE64` | No | — | Base64-encoded rclone.conf |
| `RCLONE_REMOTE` | No | `gdrive` | Rclone remote name |
| `RCLONE_FOLDER` | No | `DatabaseBackups` | Remote folder path |
| `BACKUP_DIR` | No | `/app/backups` | Temp backup directory (file deleted after upload) |
| `BACKUP_CRON_SCHEDULE` | No | `0 2 * * *` | Cron expression |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `ALERT_EMAIL` | No | — | Report recipient email |
| `NODE_ENV` | No | `development` | `production` / `development` |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |

---

## Cron Schedule Examples

| Expression | Meaning |
|---|---|
| `0 2 * * *` | Daily at 2 AM (default) |
| `0 */6 * * *` | Every 6 hours |
| `*/30 * * * *` | Every 30 minutes |
| `0 2 * * 0` | Weekly Sunday at 2 AM |
| `0 2 1 * *` | Monthly on 1st at 2 AM |

Use [crontab.guru](https://crontab.guru) to build your own.
