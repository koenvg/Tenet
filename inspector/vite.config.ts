import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  server: { host: '127.0.0.1', port: 52320, strictPort: false },
  preview: { host: '127.0.0.1', port: 52320, strictPort: false },
  build: { outDir: 'dist' },
});
