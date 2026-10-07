import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import MarketingPage from './src/MarketingPage.js';
import DocsPage from './src/DocsPage.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../web', import.meta.url)) } },
  plugins: [
    react(), tailwindcss(),
    {
      name: 'tenet-static-pages',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          const Page = context.path.endsWith('/docs.html') ? DocsPage : MarketingPage;
          return html.replace('<div id="app"></div>', `<div id="app">${renderToString(createElement(Page))}</div>`);
        },
      },
    },
  ],
  server: { host: '127.0.0.1', port: 52321 },
  build: {
    outDir: 'dist',
    rollupOptions: { input: { index: fileURLToPath(new URL('index.html', import.meta.url)), docs: fileURLToPath(new URL('docs.html', import.meta.url)) } },
  },
});
