import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import type { UserConfig } from 'vite'

/** Dev/preview only: the API runs separately; production serves both from one origin. */
const API_PROXY_TARGET = process.env.CHINCHI_API_URL ?? 'http://localhost:3000'
// `ws` also forwards the realtime gateway (/api/v1/gateway) WebSocket upgrades.
const API_PROXY = { '/api': { target: API_PROXY_TARGET, ws: true } }

export interface WebViteOptions {
  /** Lazy-load route components. Disabled in tests so coverage maps to the real source. */
  readonly codeSplitting: boolean
}

export const createViteConfig = ({ codeSplitting }: WebViteOptions): UserConfig => ({
  plugins: [
    // Must come before the React plugin: generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: 'react', autoCodeSplitting: codeSplitting }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: API_PROXY,
  },
  // `vite preview` (used by e2e) proxies the API the same way.
  preview: {
    proxy: API_PROXY,
  },
})

export default defineConfig(createViteConfig({ codeSplitting: true }))
