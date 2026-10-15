import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  platform: 'node',
  format: 'esm',
  // Workspace packages ship TypeScript sources, so they must be bundled in.
  noExternal: [/^@chinchi\//],
})
