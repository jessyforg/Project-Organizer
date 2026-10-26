import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { thirdPartyNotices } from './scripts/third-party-notices';

const alias = { '@shared': resolve(__dirname, 'src/shared') };

// Every build adds the packages it bundles; electron-builder ships the file beside the app.
const notices = thirdPartyNotices({
  rootDir: __dirname,
  outFile: resolve(__dirname, 'out/THIRD_PARTY_NOTICES.txt'),
  nativeNoticesFile: resolve(__dirname, 'build/native-notices.txt'),
});

export default defineConfig({
  main: {
    resolve: { alias },
    // Runtime dependencies (SQLite driver, zod) stay in node_modules and are required at runtime.
    build: { externalizeDeps: true },
    plugins: [notices.plugin()],
  },
  preload: {
    resolve: { alias },
    // Sandboxed preloads cannot require node_modules, so everything is bundled into one file.
    build: { externalizeDeps: false },
    plugins: [notices.plugin()],
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), notices.plugin()],
  },
});
