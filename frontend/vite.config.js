import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true,
    include: ['src/**/*.test.{js,jsx,ts,tsx}'], // only tests in src
    exclude: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.next',
      'out',
      'netlify',
      '**/e2e/**'
    ],
  },
});
