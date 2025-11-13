import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for integration tests
 * These tests spawn actual CLI processes and are slower
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000, // 30 seconds for slower integration tests
    hookTimeout: 30000,
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'tests/**',
        '**/*.d.ts',
        '**/node_modules/**',
      ],
    },
  },
});
