import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/env.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    // The suite shares one Postgres database and truncates between files, so
    // files run one at a time rather than racing each other.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
