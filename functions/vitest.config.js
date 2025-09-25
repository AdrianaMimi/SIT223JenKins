import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: 'reports/junit.xml',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage', 
      exclude: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
      ],
    },
  },
});
