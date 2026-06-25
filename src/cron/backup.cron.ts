import cron from 'node-cron';
import { runBackup } from '../backup/backup.service';
import { env } from '../config/env';
import { logger } from '../logger/logger';

let task: cron.ScheduledTask | null = null;

export function startBackupCron(): void {
  logger.info(`Scheduling backup cron: ${env.BACKUP_CRON_SCHEDULE}`);

  task = cron.schedule(env.BACKUP_CRON_SCHEDULE, async () => {
    logger.info('Cron triggered — starting backup...');
    await runBackup();
  });
}

export function stopBackupCron(): void {
  if (task) {
    task.stop();
    logger.info('Backup cron stopped.');
  }
}
