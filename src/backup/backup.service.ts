import { createPostgresBackup } from './postgres';
import { uploadToDrive } from '../drive/rclone.service';
import { sendBackupReport } from '../email/mail.service';
import { logger } from '../logger/logger';

export interface BackupResult {
  success: boolean;
  localPath?: string;
  backupSize?: number;
  remoteFile?: string;
  error?: string;
  duration: number;
}

export async function runBackup(): Promise<BackupResult> {
  const start = Date.now();
  const result: BackupResult = { success: false, duration: 0 };

  try {
    // Step 1: Create PostgreSQL backup
    const { filePath: localPath, size: backupSize } = await createPostgresBackup();
    result.localPath = localPath;
    result.backupSize = backupSize;

    // Step 2: Upload to remote, then delete local
    const uploadResult = await uploadToDrive(localPath, true);
    result.remoteFile = uploadResult.remoteFile;

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
