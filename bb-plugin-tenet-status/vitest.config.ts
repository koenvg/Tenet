import { defineConfig } from 'vitest/config';
export default defineConfig({
  envDir: false,
  plugins: [{
    name: 'native-sqlite',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'node:sqlite') return { id, external: true };
    },
  }],
  test: { include: ['ui-check.vitest.tsx', 'summary-workspace.vitest.tsx', 'overview.vitest.tsx', 'thread-rules.vitest.tsx', 'main.vitest.tsx', 'dashboard.vitest.tsx', 'dashboard-lifecycle.vitest.tsx', 'live.vitest.tsx'], environment: 'jsdom' },
});
