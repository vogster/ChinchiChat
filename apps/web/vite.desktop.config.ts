import { existsSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { createViteConfig } from './vite.config'

import type { Plugin } from 'vite'

/** Tauri serves `index.html`; the entry is `desktop.html` so that `index.html` stays the web app's. */
const desktopEntryAsIndex = (): Plugin => ({
  name: 'chinchi-desktop-entry-as-index',
  closeBundle() {
    const dir = fileURLToPath(new URL('dist-desktop/', import.meta.url))
    if (existsSync(dir + 'desktop.html')) renameSync(dir + 'desktop.html', dir + 'index.html')
  },
})

/**
 * The desktop build: the same app from `desktop.html`, which boots through
 * `src/desktop/main.tsx` (instance picker, bearer auth, Tauri plugins) instead of `src/main.tsx`.
 * Tauri loads the result from `dist-desktop`; in development it opens the dev server on 5174.
 */
export default defineConfig({
  ...createViteConfig({ codeSplitting: true }),
  plugins: [...(createViteConfig({ codeSplitting: true }).plugins ?? []), desktopEntryAsIndex()],
  // Tauri serves the files itself; a port of its own keeps `pnpm dev` (5173) running alongside.
  server: { port: 5174, strictPort: true },
  preview: {},
  build: {
    outDir: 'dist-desktop',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('desktop.html', import.meta.url)) },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
