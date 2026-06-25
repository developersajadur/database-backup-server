import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { logger } from '../logger/logger';
import { env } from '../config/env';

export interface RestoreResult {
  success: boolean;
  file: string;
  fileName: string;
  fileSize: number;
  integrityOk: boolean;
  duration: number;
  error?: string;
}

export async function restoreBackup(file: string): Promise<RestoreResult> {
  const started = Date.now();
  const fileName = path.basename(file);
  const fileSize = fs.statSync(file).size;

  const result: RestoreResult = {
    success: false,
    file,
    fileName,
    fileSize,
    integrityOk: false,
    duration: 0,
  };

  if (!fs.existsSync(file)) {
    result.error = `Backup not found: ${file}`;
    result.duration = Date.now() - started;
    return result;
  }

  if (!file.endsWith('.sql.gz')) {
    result.error = 'Backup must be a .sql.gz file.';
    result.duration = Date.now() - started;
    return result;
  }

  logger.info(`Starting restore: ${fileName}`);

  try {
    // Step 1: Verify integrity
    await verifyBackup(file);
    result.integrityOk = true;

    // Step 2: Restore
    await runRestore(file);

    result.success = true;
    logger.info(
      `Restore completed in ${((Date.now() - started) / 1000).toFixed(2)} seconds`
    );
  } catch (error: any) {
    result.error = error.message;
    logger.error(`Restore failed: ${error.message}`);
  }

  result.duration = Date.now() - started;
  return result;
}

async function verifyBackup(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gzip', ['-t', file]);

    proc.stderr.on('data', (d) => {
      logger.warn(d.toString());
    });

    proc.on('close', (code) => {
      if (code === 0) {
        logger.info('Backup integrity verified.');
        resolve();
      } else {
        reject(new Error('Backup archive is corrupted.'));
      }
    });
  });
}

async function runRestore(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gunzip = spawn('gunzip', ['-c', file]);

    const psql = spawn(
      'psql',
      [
        '-h',
        env.DB_HOST,
        '-p',
        String(env.DB_PORT),
        '-U',
        env.DB_USER,
        '-d',
        env.DB_NAME,
        '-v',
        'ON_ERROR_STOP=1',
        '--single-transaction',
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: env.DB_PASSWORD,
        },
      }
    );

    gunzip.stdout.pipe(psql.stdin);

    gunzip.stderr.on('data', (d) => {
      logger.error(d.toString());
    });

    psql.stdout.on('data', (d) => {
      logger.info(d.toString().trim());
    });

    psql.stderr.on('data', (d) => {
      logger.error(d.toString().trim());
    });

    psql.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Restore failed. Exit code: ${code}`));
      }
    });
  });
}
