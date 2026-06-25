import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { env } from '../config/env';
import { logger } from '../logger/logger';

export function setupRclone(): void {
  if (!env.RCLONE_CONFIG_BASE64) {
    logger.warn('RCLONE_CONFIG_BASE64 not set. Skipping rclone config generation.');
    return;
  }

  const dir = path.join(os.homedir(), '.config', 'rclone');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'rclone.conf'),
    Buffer.from(env.RCLONE_CONFIG_BASE64, 'base64')
  );

  logger.info(`rclone config written to ${path.join(dir, 'rclone.conf')}`);
}
