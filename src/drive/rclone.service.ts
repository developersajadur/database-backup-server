import { access, unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { env } from '../config/env';
import { logger } from '../logger/logger';

const exec = promisify(execFile);

const MAX_RETRIES = 3;

export interface UploadResult {
  success: boolean;
  remoteFile: string;
  duration: number;
}

async function runRclone(args: string[]) {
  return exec('rclone', args);
}

async function verifyUpload(remoteFile: string): Promise<boolean> {
  try {
    await runRclone(['lsf', remoteFile]);
    return true;
  } catch {
    return false;
  }
}

export async function uploadToDrive(
  localFile: string,
  deleteAfterUpload = false
): Promise<UploadResult> {
  await access(localFile);

  const fileName = basename(localFile);
  const remoteDir = `${env.RCLONE_REMOTE}:${env.RCLONE_FOLDER}`;
  const remoteFile = `${remoteDir}/${fileName}`;
  const started = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`[Upload] Attempt ${attempt}/${MAX_RETRIES}`);

      // Step 1: Upload new backup first
      logger.info('Uploading backup...');
      await runRclone([
        'copyto',
        localFile,
        remoteFile,
        '--checksum',
        '--transfers',
        '1',
        '--checkers',
        '1',
        '--progress',
      ]);

      // Step 2: Verify upload before deleting old
      logger.info('Verifying upload...');
      const verified = await verifyUpload(remoteFile);
      if (!verified) {
        throw new Error('Upload verification failed.');
      }

      // Step 3: Delete old backup files (everything except our new file)
      logger.info('Cleaning up old remote backups...');
      await runRclone([
        'delete',
        remoteDir,
        '--exclude',
        fileName,
      ]);

      if (deleteAfterUpload) {
        await unlink(localFile);
        logger.info('Local backup deleted.');
      }

      return {
        success: true,
        remoteFile,
        duration: Date.now() - started,
      };
    } catch (error: any) {
      logger.error(
        `Upload failed (Attempt ${attempt}): ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      logger.info('Retrying in 5 seconds...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error('Unexpected upload failure.');
}
