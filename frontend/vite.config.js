import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true,
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.next',
      'out',
      'netlify',
      '**/e2e/**',
    ],
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
