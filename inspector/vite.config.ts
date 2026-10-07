import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../web', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 52320, strictPort: false },
  preview: { host: '127.0.0.1', port: 52320, strictPort: false },
  build: { outDir: 'dist' },
});
