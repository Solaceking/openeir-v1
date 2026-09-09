// Test preload — runs before every bun test file.
// Points Prisma at a throwaway SQLite file and resets it, so tests are
// hermetic: no real health data is ever read or written by the suite.

import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const SCRATCH_DB = 'file:/home/z/my-project/tests/.scratch.db'

process.env.DATABASE_URL = SCRATCH_DB
process.env.APP_KEY ??= 'openeir-test-key-not-a-secret'
process.env.REALTIME_URL ??= 'http://127.0.0.1:9' // black-hole the realtime sidecar
process.env.OPENEIR_SERVICE_TOKEN ??= 'test-service-token'

// fresh scratch db every run — --force-reset drops + recreates
try { rmSync('/home/z/my-project/tests/.scratch.db') } catch { /* absent */ }
execSync('bunx prisma db push --skip-generate --force-reset', {
  cwd: '/home/z/my-project',
  env: { ...process.env },
  stdio: 'pipe',
})
