import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL('../bb-plugin-tenet-status/.summary-workspace', import.meta.url)),
    emptyOutDir: true,
    lib: { entry: fileURLToPath(new URL('./src/shared/library.svelte.ts', import.meta.url)), formats: ['es'], fileName: () => 'summary.js', cssFileName: 'summary' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
