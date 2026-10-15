import { baseVitestConfig } from '@chinchi/config/vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  baseVitestConfig,
  defineConfig({
    test: {
      coverage: {
        // Entrypoint wires real process signals and sockets; covered by e2e, not unit tests.
        exclude: ['src/server.ts'],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.int.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['src/**/*.int.test.ts'],
            globalSetup: ['./test/database.ts'],
            // Files share one database and reset it between tests, so they must not overlap.
            fileParallelism: false,
            hookTimeout: 120_000,
            testTimeout: 30_000,
          },
        },
      ],
    },
  }),
)
