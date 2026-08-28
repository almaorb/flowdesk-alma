import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Loaded before any application module, so `src/config/env.ts` sees the test
// database rather than the development one.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(apiRoot, '.env') });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://flowdesk:flowdesk@127.0.0.1:5432/flowdesk_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.SLA_JOB_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.BCRYPT_ROUNDS = '4';
