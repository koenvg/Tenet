import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['ui-check.vitest.tsx', 'summary-workspace.vitest.tsx', 'overview.vitest.tsx', 'main.vitest.tsx', 'live.vitest.tsx'], environment: 'jsdom' } });
