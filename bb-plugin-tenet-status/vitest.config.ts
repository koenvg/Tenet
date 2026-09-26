import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['ui-check.vitest.tsx'], environment: 'jsdom' } });
