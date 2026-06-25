import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../logger/logger";
import type { BackupResult } from "../backup/backup.service";
import type { RestoreResult } from "../restore/restore.service";
import { formatBytes } from "../utils";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendBackupReport(result: BackupResult): Promise<void> {
  if (!env.ALERT_EMAIL) {
    logger.warn("No alert email configured. Skipping email report.");
    return;
  }

  const subject = result.success
    ? `✅ Backup Successful — ${env.DB_NAME}`
    : `❌ Backup Failed — ${env.DB_NAME}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>
<body style="margin:0;padding:30px;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr>
<td align="center">

<table role="presentation"
style="width:650px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

<tr>
<td
style="padding:28px;background:${result.success ? "#16a34a" : "#dc2626"};color:#fff;text-align:center;">
<h1 style="margin:0;font-size:26px;">
${result.success ? "✅ Backup Successful" : "❌ Backup Failed"}
</h1>

<p style="margin-top:10px;font-size:15px;opacity:.95;">
Database Backup Report
</p>
</td>
</tr>

<tr>
<td style="padding:30px;">

<p style="margin-top:0;color:#6b7280;font-size:15px;">
Your scheduled PostgreSQL backup has ${
    result.success ? "completed successfully." : "failed."
  }
</p>

<table
style="width:100%;border-collapse:collapse;font-size:15px;">

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;width:35%;">
Database
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${env.DB_NAME}
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Status
</td>

<td
style="padding:14px;border-bottom:1px solid #ececec;color:${
    result.success ? "#16a34a" : "#dc2626"
  };font-weight:bold;">
${result.success ? "Success ✅" : "Failed ❌"}
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Backup Size
</td>

<td style="padding:14px;border-bottom:1px solid #ececec;">
${result.backupSize ? formatBytes(result.backupSize) : "N/A"}
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Duration
</td>

<td style="padding:14px;border-bottom:1px solid #ececec;">
${(result.duration / 1000).toFixed(2)} sec
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
SHA256
</td>

<td style="padding:14px;border-bottom:1px solid #ececec;word-break:break-all;font-size:13px;">
${result.sha256 ? result.sha256.slice(0, 16) + '...' : 'N/A'}
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Remote Backup
</td>

<td style="padding:14px;border-bottom:1px solid #ececec;word-break:break-all;">
${result.remoteFile ?? "N/A"}
</td>
</tr>

<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Local Backup
</td>

<td style="padding:14px;border-bottom:1px solid #ececec;word-break:break-all;">
${result.localPath ?? "N/A"}
</td>
</tr>

${
  result.error
    ? `
<tr>
<td
style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;color:#dc2626;">
Error
</td>

<td
style="padding:14px;border-bottom:1px solid #ececec;color:#dc2626;">
${result.error}
</td>
</tr>
`
    : ""
}

</table>

${
  result.success
    ? `
<div
style="margin-top:28px;padding:18px;border-radius:8px;background:#ecfdf5;border:1px solid #bbf7d0;color:#166534;">

<strong>✔ Backup completed successfully.</strong>

<p style="margin:8px 0 0;">
The database has been backed up and uploaded successfully.
</p>

</div>
`
    : `
<div
style="margin-top:28px;padding:18px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">

<strong>⚠ Backup failed.</strong>

<p style="margin:8px 0 0;">
Please check the server logs and retry the backup.
</p>

</div>
`
}

</td>
</tr>

<tr>
<td
style="padding:22px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">

<p style="margin:0;font-size:13px;color:#6b7280;">
Generated automatically by
<strong>Backup Service</strong>

</p>

<p style="margin-top:6px;font-size:12px;color:#9ca3af;">
${new Date().toLocaleString()}
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: env.SMTP_USER,
      to: env.ALERT_EMAIL,
      subject,
      html,
    });
    logger.info("Backup report email sent.");
  } catch (error: any) {
    logger.error(`Failed to send email: ${error.message}`);
  }
}

export async function sendRestoreReport(result: RestoreResult): Promise<void> {
  if (!env.ALERT_EMAIL) {
    logger.warn("No alert email configured. Skipping restore report.");
    return;
  }

  const subject = result.success
    ? `🔄 Restore Successful — ${env.DB_NAME}`
    : `❌ Restore Failed — ${env.DB_NAME}`;

  const checkmark = (ok: boolean) => ok ? '✅ Passed' : '❌ Failed';
  const checkColor = (ok: boolean) => ok ? '#16a34a' : '#dc2626';

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>
<body style="margin:0;padding:30px;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr>
<td align="center">

<table role="presentation"
style="width:650px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

<tr>
<td
style="padding:28px;background:${result.success ? '#16a34a' : '#dc2626'};color:#fff;text-align:center;">
<h1 style="margin:0;font-size:26px;">
${result.success ? '🔄 Restore Successful' : '❌ Restore Failed'}
</h1>
<p style="margin-top:10px;font-size:15px;opacity:.95;">
Database Restore Report
</p>
</td>
</tr>

<tr>
<td style="padding:30px;">

<p style="margin-top:0;color:#6b7280;font-size:15px;">
Database restore has ${result.success ? 'completed successfully.' : 'failed.'}
</p>

<table style="width:100%;border-collapse:collapse;font-size:15px;">

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;width:35%;">
Database
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${env.DB_NAME}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Status
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${
    result.success ? '#16a34a' : '#dc2626'
  };font-weight:bold;">
${result.success ? 'Success ✅' : 'Failed ❌'}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Backup File
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;word-break:break-all;">
${result.fileName}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
File Size
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${formatBytes(result.fileSize)}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
SHA256
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${checkColor(result.sha256Ok)};">
${checkmark(result.sha256Ok)}
${result.sha256Expected !== 'skipped' ? ` <span style="color:#9ca3af;font-size:12px;">(${result.sha256Expected.slice(0, 12)}...)</span>` : ''}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
gzip Integrity
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${checkColor(result.gzipOk)};">
${checkmark(result.gzipOk)}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Temp Database
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${result.tempDbName}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Restore to Temp
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${checkColor(result.restoreOk)};">
${checkmark(result.restoreOk)}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Tables Found
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${result.tableCount}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Approx. Rows
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${result.rowCount.toLocaleString()}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Validation
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${checkColor(result.validationOk)};">
${checkmark(result.validationOk)}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Swap
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:${checkColor(result.swapped)};">
${result.swapped ? '✅ Promoted to target' : '❌ Not performed'}
</td>
</tr>

<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;">
Duration
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;">
${(result.duration / 1000).toFixed(2)} sec
</td>
</tr>

${
  result.error
    ? `
<tr>
<td style="padding:14px;border-bottom:1px solid #ececec;font-weight:bold;color:#dc2626;">
Error
</td>
<td style="padding:14px;border-bottom:1px solid #ececec;color:#dc2626;">
${result.error}
</td>
</tr>
`
    : ''
}

</table>

${
  result.success
    ? `
<div style="margin-top:28px;padding:18px;border-radius:8px;background:#ecfdf5;border:1px solid #bbf7d0;color:#166534;">
<strong>✔ Restore completed successfully.</strong>
<p style="margin:8px 0 0;">
Database <strong>${env.DB_NAME}</strong> has been restored from <strong>${result.fileName}</strong>.
All checks passed — SHA256, gzip, restore, validation, and swap.
</p>
</div>
`
    : `
<div style="margin-top:28px;padding:18px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;">
<strong>⚠ Restore failed.</strong>
<p style="margin:8px 0 0;">
The restore operation did not complete successfully. Target database <strong>${env.DB_NAME}</strong> remains untouched.
Temp database <strong>${result.tempDbName}</strong> has been dropped.
</p>
</div>
`
}

</td>
</tr>

<tr>
<td style="padding:22px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:13px;color:#6b7280;">
Generated automatically by <strong>Backup Service</strong>
</p>
<p style="margin-top:6px;font-size:12px;color:#9ca3af;">
${new Date().toLocaleString()}
</p>
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: env.SMTP_USER,
      to: env.ALERT_EMAIL,
      subject,
      html,
    });
    logger.info("Restore report email sent.");
  } catch (error: any) {
    logger.error(`Failed to send restore email: ${error.message}`);
  }
}
