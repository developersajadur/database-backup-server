import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // PostgreSQL
  DATABASE_URL: process.env.DATABASE_URL || '',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // Email (SMTP)
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  ALERT_EMAIL: process.env.ALERT_EMAIL || '',

  // Rclone
  RCLONE_CONFIG_BASE64: process.env.RCLONE_CONFIG_BASE64 || '',
  RCLONE_REMOTE: process.env.RCLONE_REMOTE || 'gdrive',
  RCLONE_FOLDER: process.env.RCLONE_FOLDER || 'DatabaseBackups',

  // Cron schedule (default: daily at 2 AM)
  BACKUP_CRON_SCHEDULE: process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *',

  // Backup directory (temp — file deleted after upload)
  BACKUP_DIR: process.env.BACKUP_DIR || '/app/backups',

  // App
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
