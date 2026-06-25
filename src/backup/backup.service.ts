import { createPostgresBackup } from './postgres';
import { uploadToDrive } from '../drive/rclone.service';
import { sendBackupReport } from '../email/mail.service';
import { logger } from '../logger/logger';
import fs from 'fs';

export interface BackupResult {
  success: boolean;
  localPath?: string;
  backupSize?: number;
  sha256?: string;
  remoteFile?: string;
  error?: string;
  duration: number;
}

export async function runBackup(): Promise<BackupResult> {
  const start = Date.now();
  const result: BackupResult = { success: false, duration: 0 };

  try {
    // Step 1: Create PostgreSQL backup
    const { filePath: localPath, size: backupSize, sha256 } = await createPostgresBackup();
    result.localPath = localPath;
    result.backupSize = backupSize;
    result.sha256 = sha256;

    // Step 2: Upload backup file + checksum to remote, then delete local
    const uploadResult = await uploadToDrive(localPath, true);
    result.remoteFile = uploadResult.remoteFile;

    // Upload checksum file too
    const shaFile = localPath + '.sha256';
    if (fs.existsSync(shaFile)) {
      await uploadToDrive(shaFile, true);
    }

    result.success = true;
    logger.info('Backup pipeline completed successfully.');
  } catch (error: any) {
    result.error = error.message;
    logger.error(`Backup pipeline failed: ${error.message}`);
  } finally {
    result.duration = Date.now() - start;
    await sendBackupReport(result);
  }

  return result;
}
