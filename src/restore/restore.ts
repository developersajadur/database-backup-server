import { restoreBackup } from './restore.service';
import { sendRestoreReport } from '../email/mail.service';

async function main() {
  const backup = process.argv[2];

  if (!backup) {
    console.error('Usage: npm run restore backups/backup.sql.gz');
    process.exit(1);
  }

  const result = await restoreBackup(backup);
  await sendRestoreReport(result);

  if (result.success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
