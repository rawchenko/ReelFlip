import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(__dirname, '..', '..')
const tsxBin = resolve(backendRoot, 'node_modules/.bin/tsx')

const result = spawnSync(tsxBin, ['src/verification/cli/evaluate-rollout-gate.ts', ...process.argv.slice(2)], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
