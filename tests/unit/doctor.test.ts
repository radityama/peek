import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { CLOUDFLARED_VERSION } from '../../src/cloudflared/platform.js'
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
    expect(checks.find((check) => check.name === 'peek')?.message).toContain(
      '0.2.2',
    )
    expect(
      checks.find((check) => check.name === 'platform')?.message,
    ).toContain(`${process.platform}/${process.arch}`)
    expect(checks.find((check) => check.name === 'config')?.status).toBe('pass')
    expect(checks.find((check) => check.name === 'project')?.message).toContain(
      'configured command',
    )
    expect(checks.find((check) => check.name === 'command')?.status).toBe(
      'pass',
    )
    expect(checks.find((check) => check.name === 'network')).toMatchObject({
      status: 'warn',
      remedy: expect.any(String),
    })
    expect(
      checks.find((check) => check.name === 'cloudflared')?.message,
    ).toContain(CLOUDFLARED_VERSION)
    expect(checks.every((check) => check.detail === undefined)).toBe(true)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

it('adds safe network context in verbose diagnostics', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'peek-doctor-'))
  try {
    await writeFile(
      join(cwd, 'peek.config.ts'),
      `export default { command: [${JSON.stringify(process.execPath)}, '--version'] }`,
    )
    const checks = await runDoctor({
      cwd,
      verbose: true,
      networkCheck: async () => false,
    })
    expect(checks.find((check) => check.name === 'network')?.detail).toContain(
      '7844',
    )
    expect(JSON.stringify(checks)).not.toContain(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

it('identifies a project package manager without printing its source', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'peek-doctor-'))
  try {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'private-project-name',
        packageManager: 'npm@11.0.0',
        scripts: { dev: 'node server.js' },
      }),
    )
    const checks = await runDoctor({ cwd, networkCheck: async () => true })
    expect(checks.find((check) => check.name === 'project')).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('npm'),
    })
    expect(JSON.stringify(checks)).not.toContain('private-project-name')
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
