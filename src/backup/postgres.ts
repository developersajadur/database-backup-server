import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../logger/logger';

const execAsync = promisify(exec);

export interface BackupFile {
  filePath: string;
  size: number;
  sha256: string;
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
    const sha256 = await computeSHA256(filePath);

    // Write .sha256 checksum file alongside backup
    const shaFile = filePath + '.sha256';
    fs.writeFileSync(shaFile, `${sha256}  ${fileName}\n`);

    logger.info(`Backup created: ${filePath} (${(size / 1024 / 1024).toFixed(2)} MB, sha256: ${sha256.slice(0, 12)}...)`);
    return { filePath, size, sha256 };
  } catch (error: any) {
    logger.error(`Backup failed: ${error.message}`);
    throw error;
  }
}

function computeSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
