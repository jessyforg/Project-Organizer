import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias },
    // Runtime dependencies (SQLite driver, zod) stay in node_modules and are required at runtime.
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias },
    // Sandboxed preloads cannot require node_modules, so everything is bundled into one file.
    build: { externalizeDeps: false },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
});
