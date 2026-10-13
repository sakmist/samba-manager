import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      // Keep generated settings/session files out of the working tree.
      DATA_DIR: '.test-data',
      LOG_LEVEL: 'error',
    },
  },
});
