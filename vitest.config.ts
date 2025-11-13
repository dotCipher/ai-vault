import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Prevent hanging processes
    testTimeout: 30000, // 30s max per test
    hookTimeout: 30000, // 30s max for hooks
    pool: 'forks', // Use fork pool for better cleanup
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4, // Limit concurrent worker processes
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/cli.ts', // CLI entry point
      ],
    },
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/unit/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'tests/integration/**', // Integration tests run separately
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
