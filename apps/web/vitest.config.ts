import { baseVitestConfig } from '@chinchi/config/vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

import { createViteConfig } from './vite.config.ts'

export default mergeConfig(
  mergeConfig(createViteConfig({ codeSplitting: false }), baseVitestConfig),
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Each test renders the whole app; with the monorepo testing in parallel the default 5s
      // is too tight for tests that wait on several steps (findBy* waits up to 3s each).
      testTimeout: 15_000,
      coverage: {
        exclude: ['src/main.tsx', 'src/routeTree.gen.ts', 'src/test/**'],
      },
    },
  }),
)
