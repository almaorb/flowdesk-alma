import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load apps/api/.env first, then anything in the process cwd, without ever
// clobbering values that were already exported into the environment (docker
// compose and CI both inject env vars directly).
for (const candidate of [path.join(packageRoot, '.env'), path.join(process.cwd(), '.env')]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate });
}

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),

  SLA_JOB_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  SLA_JOB_ENABLED: booleanish.default(true),

  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  API_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60 * 1000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
});

export type Env = z.infer<typeof envSchema>;

const INSECURE_DEFAULTS = new Set([
  'dev-access-secret-change-me-0123456789',
  'dev-refresh-secret-change-me-0123456789',
]);

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    if (
      INSECURE_DEFAULTS.has(env.JWT_ACCESS_SECRET) ||
      INSECURE_DEFAULTS.has(env.JWT_REFRESH_SECRET)
    ) {
      throw new Error(
        'Refusing to start in production with the example JWT secrets. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.',
      );
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
    }
  }

  return env;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
