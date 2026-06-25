import { startBackupCron } from './cron/backup.cron';
import { runBackup } from './backup/backup.service';
import { logger } from './logger/logger';
import { env } from './config/env';
import { setupRclone } from './utils/rclone';

function validateEnv(): void {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  logger.info('Environment validation passed.');
}

async function main(): Promise<void> {
  logger.info(`Starting db-backup-server in ${env.NODE_ENV} mode`);

  // Startup tasks
  validateEnv();
  setupRclone();

  // Run backup immediately on startup (optional: comment out to only run on cron)
  const runImmediately = process.argv.includes('--now');
  if (runImmediately) {
    logger.info('Running immediate backup (--now flag detected)...');
    await runBackup();
  }

  // Start cron scheduler
  startBackupCron();

  logger.info('db-backup-server is running.');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  const { stopBackupCron } = require('./cron/backup.cron');
  stopBackupCron();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down...');
  const { stopBackupCron } = require('./cron/backup.cron');
  stopBackupCron();
  process.exit(0);
});

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
