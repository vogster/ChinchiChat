// Runs the k6 gateway load test in Docker against a server on the host (:3100 by default).
// Seed first with `pnpm load:seed`, then start the production build on the chinchi_load
// database (see PLAN.md §4.9). Extra env (RAMP_S, HOLD_S, SEND_EVERY_MS, BASE) goes to k6.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const K6_IMAGE = 'grafana/k6:1.3.0'
const here = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '')
const data = fileURLToPath(new URL('./.data', import.meta.url))

if (!existsSync(`${data}/users.json`)) {
  process.stderr.write('No load/.data/users.json: run `pnpm load:seed` first.\n')
  process.exit(1)
}

const passEnv = ['RAMP_S', 'HOLD_S', 'SEND_EVERY_MS', 'BASE'].flatMap((key) =>
  process.env[key] ? ['-e', `${key}=${process.env[key]}`] : [],
)

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ulimit',
    'nofile=65536:65536',
    '-v',
    `${here}:/scripts:ro`,
    '-v',
    `${data}:/data:ro`,
    ...passEnv,
    K6_IMAGE,
    'run',
    '/scripts/gateway-delivery.js',
  ],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
)
process.exit(result.status ?? 1)
