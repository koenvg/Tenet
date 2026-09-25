import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [svelte()],
  test: {
    include: ['inspector/tests/components/**/*.vitest.ts'],
    setupFiles: ['vitest-browser-svelte'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { headless: true } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
