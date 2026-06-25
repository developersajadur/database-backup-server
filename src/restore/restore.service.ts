import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { logger } from '../logger/logger';
import { env } from '../config/env';

const execAsync = promisify(exec);

const TEMP_DB_SUFFIX = '_restore_temp';

export interface RestoreResult {
  success: boolean;
  file: string;
  fileName: string;
  fileSize: number;
  sha256Expected: string;
  sha256Ok: boolean;
  gzipOk: boolean;
  tempDbName: string;
  restoreOk: boolean;
  tableCount: number;
  rowCount: number;
  validationOk: boolean;
  swapped: boolean;
  duration: number;
  error?: string;
}

function pgEnv() {
  return {
    ...process.env,
    PGPASSWORD: env.DB_ADMIN_PASSWORD,
  } as NodeJS.ProcessEnv;
}

async function pgExec(query: string, db: string): Promise<string> {
  const { stdout } = await execAsync(
    `PGPASSWORD="${env.DB_ADMIN_PASSWORD}" psql -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_ADMIN_USER} -d ${db} -t -c "${query}"`
  );
  return stdout.trim();
}

/* ──────────── Step 1: Download from rclone remote ──────────── */

async function downloadIfRemote(filePath: string): Promise<string> {
  if (filePath.startsWith(`${env.RCLONE_REMOTE}:`)) {
    const localDir = env.BACKUP_DIR;
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const localFile = path.join(localDir, fileName);
    const remoteSha = filePath + '.sha256';
    const localSha = localFile + '.sha256';

    logger.info(`Downloading ${filePath}...`);
    await execAsync(`rclone copyto "${filePath}" "${localFile}"`);

    try {
      await execAsync(`rclone copyto "${remoteSha}" "${localSha}"`);
    } catch {
      logger.warn('No .sha256 checksum file found on remote.');
    }

    return localFile;
  }

  return filePath;
}

/* ──────────── Step 2: SHA256 verification ──────────── */

async function verifySHA256(filePath: string): Promise<{ ok: boolean; expected: string }> {
  const shaFile = filePath + '.sha256';

  if (!fs.existsSync(shaFile)) {
    logger.warn('No .sha256 file found — skipping SHA256 verification.');
    return { ok: true, expected: 'skipped' };
  }

  const content = fs.readFileSync(shaFile, 'utf-8');
  const match = content.match(/^([a-f0-9]+)\s+/);
  if (!match) {
    throw new Error('Malformed .sha256 file.');
  }

  const expected = match[1];

  const actual = await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

  if (expected !== actual) {
    logger.error(`SHA256 mismatch!\n  Expected: ${expected}\n  Actual:   ${actual}`);
    return { ok: false, expected };
  }

  logger.info('SHA256 verified.');
  return { ok: true, expected };
}

/* ──────────── Step 3: gzip integrity ──────────── */

async function verifyGzip(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('gzip', ['-t', filePath]);
    proc.stderr.on('data', (d) => logger.warn(d.toString()));
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info('gzip integrity verified.');
        resolve(true);
      } else {
        logger.error('gzip archive is corrupted.');
        resolve(false);
      }
    });
  });
}

/* ──────────── Step 4: Create temporary database ──────────── */

async function createTempDb(tempDbName: string): Promise<void> {
  logger.info(`Creating temporary database: ${tempDbName}`);
  await execAsync(
    `PGPASSWORD="${env.DB_ADMIN_PASSWORD}" createdb -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_ADMIN_USER} "${tempDbName}"`
  );
  logger.info(`Temporary database created: ${tempDbName}`);
}

async function dropDb(dbName: string): Promise<void> {
  logger.info(`Dropping database: ${dbName}`);
  await execAsync(
    `PGPASSWORD="${env.DB_ADMIN_PASSWORD}" dropdb -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_ADMIN_USER} --if-exists "${dbName}"`
  );
}

/* ──────────── Step 5: Restore into temp DB ──────────── */

async function runRestore(filePath: string, targetDb: string): Promise<boolean> {
  return new Promise((resolve) => {
    const gunzip = spawn('gunzip', ['-c', filePath]);
    const psql = spawn('psql', [
      '-h', env.DB_HOST,
      '-p', String(env.DB_PORT),
      '-U', env.DB_ADMIN_USER,
      '-d', targetDb,
      '-v', 'ON_ERROR_STOP=1',
      '--single-transaction',
    ], { env: pgEnv() });

    gunzip.stdout.pipe(psql.stdin);

    gunzip.stderr.on('data', (d) => logger.error(d.toString()));
    psql.stdout.on('data', (d) => logger.info(d.toString().trim()));
    psql.stderr.on('data', (d) => logger.error(d.toString().trim()));

    psql.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/* ──────────── Step 6: Validation ──────────── */

async function validateRestore(dbName: string): Promise<{ tableCount: number; rowCount: number }> {
  logger.info(`Validating restored database: ${dbName}`);

  const tablesRaw = await pgExec(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
    dbName
  );
  const tableCount = parseInt(tablesRaw, 10) || 0;
  logger.info(`Tables found: ${tableCount}`);

  if (tableCount === 0) {
    return { tableCount: 0, rowCount: 0 };
  }

  // Sum approximate row counts for all user tables
  const rowRaw = await pgExec(
    `SELECT sum(n_live_tup) FROM pg_stat_user_tables`,
    dbName
  );
  const rowCount = parseInt(rowRaw, 10) || 0;
  logger.info(`Approximate rows: ${rowCount}`);

  return { tableCount, rowCount };
}

/* ──────────── Step 7: Swap — promote temp → target ──────────── */

async function swapDatabases(tempDbName: string): Promise<void> {
  const target = env.DB_NAME;

  // Kill all connections to target DB
  logger.info(`Terminating connections to ${target}...`);
  await execAsync(
    `PGPASSWORD="${env.DB_ADMIN_PASSWORD}" psql -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_ADMIN_USER} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${target}' AND pid <> pg_backend_pid()"`
  ).catch(() => {
    logger.warn('Could not terminate all connections (may already be disconnected).');
  });

  // Drop target
  await dropDb(target);

  // Rename temp → target
  logger.info(`Renaming ${tempDbName} → ${target}`);
  await execAsync(
    `PGPASSWORD="${env.DB_ADMIN_PASSWORD}" psql -h ${env.DB_HOST} -p ${env.DB_PORT} -U ${env.DB_ADMIN_USER} -d postgres -c "ALTER DATABASE \\"${tempDbName}\\" RENAME TO \\"${target}\\""`
  );

  logger.info(`Database swapped: ${target} is now the restored backup.`);
}

/* ──────────── Main ──────────── */

export async function restoreBackup(filePathOrRemote: string): Promise<RestoreResult> {
  const started = Date.now();

  const result: RestoreResult = {
    success: false,
    file: filePathOrRemote,
    fileName: '',
    fileSize: 0,
    sha256Expected: '',
    sha256Ok: false,
    gzipOk: false,
    tempDbName: `${env.DB_NAME}${TEMP_DB_SUFFIX}`,
    restoreOk: false,
    tableCount: 0,
    rowCount: 0,
    validationOk: false,
    swapped: false,
    duration: 0,
  };

  try {
    // ---- Step 1: Download ----
    const localFile = await downloadIfRemote(filePathOrRemote);
    result.file = localFile;
    result.fileName = path.basename(localFile);
    result.fileSize = fs.statSync(localFile).size;

    if (!localFile.endsWith('.sql.gz')) {
      result.error = 'Backup must be a .sql.gz file.';
      result.duration = Date.now() - started;
      return result;
    }

    logger.info(`Starting restore: ${result.fileName}`);

    // ---- Step 2: SHA256 ----
    const shaResult = await verifySHA256(localFile);
    result.sha256Expected = shaResult.expected;
    result.sha256Ok = shaResult.ok;
    if (!shaResult.ok) {
      result.error = 'SHA256 verification failed — file may be corrupted or tampered.';
      result.duration = Date.now() - started;
      return result;
    }

    // ---- Step 3: gzip integrity ----
    result.gzipOk = await verifyGzip(localFile);
    if (!result.gzipOk) {
      result.error = 'gzip integrity check failed — archive is corrupted.';
      result.duration = Date.now() - started;
      return result;
    }

    // ---- Step 4: Create temp DB ----
    await dropDb(result.tempDbName);
    await createTempDb(result.tempDbName);

    // ---- Step 5: Restore into temp DB ----
    result.restoreOk = await runRestore(localFile, result.tempDbName);
    if (!result.restoreOk) {
      result.error = 'Restore into temporary database failed.';
      await dropDb(result.tempDbName);
      result.duration = Date.now() - started;
      return result;
    }

    // ---- Step 6: Validate ----
    const { tableCount, rowCount } = await validateRestore(result.tempDbName);
    result.tableCount = tableCount;
    result.rowCount = rowCount;
    result.validationOk = tableCount > 0;

    if (!result.validationOk) {
      result.error = 'Validation failed: no tables found in restored database.';
      await dropDb(result.tempDbName);
      result.duration = Date.now() - started;
      return result;
    }

    // ---- Step 7: Swap ----
    await swapDatabases(result.tempDbName);
    result.swapped = true;
    result.success = true;

    logger.info(
      `Restore completed in ${((Date.now() - started) / 1000).toFixed(2)} seconds`
    );
  } catch (error: any) {
    result.error = error.message;
    logger.error(`Restore failed: ${error.message}`);

    // Clean up temp DB if it exists
    try {
      await dropDb(result.tempDbName);
    } catch {
      // ignore
    }
  }

  result.duration = Date.now() - started;
  return result;
}
