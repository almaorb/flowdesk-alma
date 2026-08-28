import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Brings the dedicated test database up to the current migration state once
 * per run. Uses `migrate deploy`, so it applies exactly the committed
 * migrations — the same path a real deployment takes.
 */
export default function setup(): void {
  dotenv.config({ path: path.join(apiRoot, '.env') });

  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://flowdesk:flowdesk@127.0.0.1:5432/flowdesk_test?schema=public';

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
