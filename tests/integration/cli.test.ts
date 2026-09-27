import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeAll, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const cliFile = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))

beforeAll(async () => {
  await execFileAsync('pnpm', ['build'], {
    cwd: root,
    shell: process.platform === 'win32',
  })
})

async function run(args: string[]): Promise<{ code: number; output: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliFile, ...args], {
      cwd: root,
      timeout: 10_000,
    })
    return { code: 0, output: result.stdout + result.stderr }
  } catch (error) {
    const result = error as Error & {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: result.code ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    }
  }
}

it('shows help without starting a tunnel', async () => {
  const result = await run(['--help'])
  expect(result.code).toBe(0)
  expect(result.output).toContain('peek dev')
  expect(result.output).toContain('peek -- pnpm dev')
  expect(result.output).toContain('--no-qr')
  expect(result.output).toContain('--version')
})

it('shows the package version', async () => {
  const result = await run(['--version'])
  expect(result.code).toBe(0)
  expect(result.output).toContain('0.2.0')
})

it('keeps help and version machine-readable with --json', async () => {
  const version = await run(['--json', '--version'])
  expect(version.code).toBe(0)
  expect(JSON.parse(version.output)).toMatchObject({
    schemaVersion: 1,
    type: 'version',
    version: '0.2.0',
  })
  const help = await run(['--json', '--help'])
  expect(help.code).toBe(0)
  expect(JSON.parse(help.output)).toMatchObject({
    schemaVersion: 1,
    type: 'help',
  })
})

it('supports the dev alias for help', async () => {
  const result = await run(['dev', '--help'])
  expect(result.code).toBe(0)
  expect(result.output).toContain('USAGE peek [OPTIONS]')
})

it('rejects an invalid port before downloading cloudflared', async () => {
  const result = await run(['--port', 'not-a-port'])
  expect(result.code).not.toBe(0)
  expect(result.output).toContain('Invalid port')
  expect(result.output).not.toContain('at ')
})

it('rejects an unsupported provider', async () => {
  const result = await run(['--provider', 'ngrok'])
  expect(result.code).not.toBe(0)
  expect(result.output).toContain('cloudflare')
})

it('rejects LAN mode for live doctor before starting a server', async () => {
  const result = await run(['doctor', '--live', '--lan'])
  expect(result.code).toBe(2)
  expect(result.output).toContain('peek doctor does not support --lan')
})

it('allows only localhost as an origin Host override', async () => {
  const result = await run(['--host-header', 'example.com'])
  expect(result.code).toBe(2)
  expect(result.output).toContain('--host-header only accepts localhost')
  const accepted = await run(['--host-header', 'localhost', '--port', 'bad'])
  expect(accepted.output).toContain('Invalid port')
})

it('rejects an empty explicit command', async () => {
  const result = await run(['--'])
  expect(result.code).toBe(2)
  expect(result.output).toContain('No command followed --')
})

it('rejects unknown positional commands', async () => {
  const result = await run(['run'])
  expect(result.code).toBe(2)
  expect(result.output).toContain('Unknown command')
})

it('rejects unknown options before starting a dev server', async () => {
  const result = await run(['--bogus'])
  expect(result.code).toBe(2)
  expect(result.output).toContain('Unknown option')
  expect(result.output).not.toContain('Preparing tunnel engine')
})
