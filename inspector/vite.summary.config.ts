import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../bb-plugin-tenet-status/.summary-workspace', import.meta.url)),
    emptyOutDir: true,
    lib: { entry: fileURLToPath(new URL('./src/shared/library.tsx', import.meta.url)), formats: ['es'], fileName: () => 'summary.js', cssFileName: 'summary' },
    rollupOptions: { external: ['react', 'react-dom/client', 'react/jsx-runtime'], output: { inlineDynamicImports: true } },
  },
});
