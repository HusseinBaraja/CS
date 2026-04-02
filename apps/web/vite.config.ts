import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: resolve(__dirname, '../..'),
  envPrefix: ['VITE_', 'SITE_'],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  // @ts-ignore
  test: {
    environment: 'jsdom',
    include: ['src/**/*.vitest.tsx'],
  },
});
