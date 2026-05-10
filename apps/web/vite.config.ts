import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  envDir: resolve(__dirname, '../..'),
  envPrefix: ['VITE_', 'SITE_'],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/exceljs/')) {
            return 'vendor-exceljs';
          }

          if (id.includes('/node_modules/gsap/') || id.includes('/node_modules/@gsap/react/')) {
            return 'vendor-gsap';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.vitest.tsx'],
  },
});
