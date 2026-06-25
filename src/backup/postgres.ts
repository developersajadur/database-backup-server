import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { logger } from '../logger/logger';

const execAsync = promisify(exec);

export interface BackupFile {
  filePath: string;
  size: number;
}

export async function createPostgresBackup(): Promise<BackupFile> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${env.DB_NAME}-${timestamp}.sql.gz`;
  const backupDir = env.BACKUP_DIR;
  const filePath = path.join(backupDir, fileName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const command = `PGPASSWORD="${env.DB_PASSWORD}" pg_dump -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_USER} -d ${env.DB_NAME} | gzip > "${filePath}"`;

  logger.info('Starting PostgreSQL backup...');
  try {
    await execAsync(command); 
    const { size } = fs.statSync(filePath);
    logger.info(`Backup created: ${filePath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    return { filePath, size };
  } catch (error: any) {
    logger.error(`Backup failed: ${error.message}`);
    throw error;
  }
}

export async function cleanupOldBackups(): Promise<void> {
  const backupDir = env.BACKUP_DIR;
  if (!fs.existsSync(backupDir)) return;

  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const maxAge = env.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      logger.info(`Removed old backup: ${file}`);
    }
  }
}
