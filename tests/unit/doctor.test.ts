import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runDoctor } from '../../src/core/doctor.js'

it('reports actionable local checks without a public tunnel', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'peek-doctor-'))
  try {
    await writeFile(
      join(cwd, 'peek.config.ts'),
      `export default { command: [${JSON.stringify(process.execPath)}, '--version'] }`,
    )
    const checks = await runDoctor({ cwd, networkCheck: async () => false })
    expect(checks.find((check) => check.name === 'node')?.status).toBe('pass')
    expect(checks.find((check) => check.name === 'config')?.status).toBe('pass')
    expect(checks.find((check) => check.name === 'command')?.status).toBe(
      'pass',
    )
    expect(checks.find((check) => check.name === 'network')).toMatchObject({
      status: 'warn',
      remedy: expect.any(String),
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

it('reports an invalid config with a remedy', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'peek-doctor-'))
  try {
    await writeFile(join(cwd, 'peek.config.ts'), 'export default { bad: true }')
    const checks = await runDoctor({ cwd, networkCheck: async () => true })
    expect(checks.find((check) => check.name === 'config')).toMatchObject({
      status: 'fail',
      remedy: expect.any(String),
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
