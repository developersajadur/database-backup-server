import { createPostgresBackup, cleanupOldBackups } from './postgres';
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

    // Step 2: Upload via rclone to remote
    const uploadResult = await uploadToDrive(localPath);
    result.remoteFile = uploadResult.remoteFile;

    // Step 3: Cleanup old local backups
    await cleanupOldBackups();

    result.success = true;
    logger.info('Backup pipeline completed successfully.');
  } catch (error: any) {
    result.error = error.message;
    logger.error(`Backup pipeline failed: ${error.message}`);
  } finally {
    result.duration = Date.now() - start;
    // Send email report regardless of success/failure
    await sendBackupReport(result);
  }

  return result;
}
