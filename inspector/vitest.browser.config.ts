import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
  test: {
    include: ['inspector/tests/components/**/*.vitest.ts'],
    setupFiles: ['vitest-browser-react'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { headless: true } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
