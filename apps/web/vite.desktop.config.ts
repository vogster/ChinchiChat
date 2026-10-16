import { defineConfig } from 'vite'

import { createViteConfig } from './vite.config'

/**
 * The desktop build: the same app from `desktop/index.html`, which boots through
 * `src/desktop/main.tsx` (instance picker, bearer auth, Tauri plugins) instead of `src/main.tsx`.
 * Tauri loads the result from `dist-desktop`; in development it opens the dev server on 5174.
 */
export default defineConfig({
  ...createViteConfig({ codeSplitting: true, root: 'desktop' }),
  publicDir: '../public',
  // Tauri serves the files itself; a port of its own keeps `pnpm dev` (5173) running alongside.
  server: { port: 5174, strictPort: true },
  preview: {},
  build: { outDir: '../dist-desktop', emptyOutDir: true },
  // Tauri's webviews are current; no legacy targets.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
