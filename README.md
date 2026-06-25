# db-backup-server

Automated PostgreSQL backup server — dumps database, uploads to Google Drive, sends email alerts.

## Features

- PostgreSQL `pg_dump` with gzip compression
- Google Drive upload via service account
- Email reports on success/failure (SMTP)
- Cron-based scheduling
- Automatic local backup cleanup (configurable retention)
- Dockerized

## Quick Start

```bash
cp .env.example .env
# Fill in your .env values
npm install
npm run dev          # start cron scheduler
npm run backup       # run backup once immediately
```

## Docker

```bash
docker compose up -d
```

## Environment Variables

See [.env.example](./.env.example) for full list.

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes | Base64-encoded GCP service account JSON key |
| `GOOGLE_DRIVE_FOLDER_ID` | No | Drive folder to upload into |
| `SMTP_HOST` | Yes | SMTP server host |
| `SMTP_PORT` | Yes | SMTP port |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `ALERT_EMAIL` | Yes | Email to receive backup reports |
| `BACKUP_CRON_SCHEDULE` | No | Cron expression (default: `0 2 * * *`) |
| `BACKUP_RETENTION_DAYS` | No | Days to keep local backups (default: 7) |

## Google Service Account Setup

1. Create a service account in GCP
2. Enable Google Drive API
3. Generate a JSON key
4. Base64-encode it: `cat key.json | base64`
5. Set `GOOGLE_SERVICE_ACCOUNT_KEY` to the encoded string
6. Share the target Drive folder with the service account email

## Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled app |
| `npm run dev` | Run with ts-node |
| `npm run backup` | Run single backup then exit |
