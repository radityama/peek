import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loadConfig, validateConfig } from '../../src/core/config.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

it('accepts argv config and rejects shell command strings', () => {
  expect(
    validateConfig({ command: ['bun', 'run', 'dev'], port: 3000 }),
  ).toEqual({
    command: ['bun', 'run', 'dev'],
    port: 3000,
  })
  expect(() => validateConfig({ command: 'bun run dev' })).toThrow(
    'command must be a nonempty array',
  )
  expect(() => validateConfig({ unexpected: true })).toThrow('Unknown option')
  const sparseCommand = ['bun']
  sparseCommand[2] = 'dev'
  expect(() => validateConfig({ command: sparseCommand })).toThrow(
    'command must be a nonempty array',
  )
})

it('loads TypeScript from the project root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-config-'))
  directories.push(directory)
  await writeFile(
    join(directory, 'peek.config.ts'),
    'const port: number = 4321; export default { command: ["bun", "run", "dev"], port }',
  )
  expect(await loadConfig(directory)).toEqual({
    command: ['bun', 'run', 'dev'],
    port: 4321,
  })
})

it('does not require a config file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-config-'))
  directories.push(directory)
  expect(await loadConfig(directory)).toBeUndefined()
})

it('rejects invalid config fields and a throwing config file', async () => {
  expect(() => validateConfig({ port: 70000 })).toThrow('port must be')
  expect(() => validateConfig({ provider: 'other' })).toThrow(
    'provider must be',
  )
  expect(() => validateConfig({ qr: 'yes' })).toThrow('qr must be')

  const directory = await mkdtemp(join(tmpdir(), 'peek-config-'))
  directories.push(directory)
  await writeFile(
    join(directory, 'peek.config.ts'),
    'throw new Error("broken config")',
  )
  await expect(loadConfig(directory)).rejects.toMatchObject({
    code: 'PROJECT_INVALID',
  })
})
