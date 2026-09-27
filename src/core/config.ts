import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { createJiti } from 'jiti'
import type { PeekConfig } from '../config.js'
import { PeekError } from '../utils/errors.js'

const configFile = 'peek.config.ts'

export async function loadConfig(cwd: string): Promise<PeekConfig | undefined> {
  const path = join(cwd, configFile)
  try {
    await access(path)
  } catch {
    return undefined
  }
  let value: unknown
  try {
    value = await createJiti(import.meta.url).import(path, { default: true })
  } catch (cause) {
    throw new PeekError(
      'PROJECT_INVALID',
      `Peek could not load ${configFile}.`,
      'Fix the configuration file or remove it to use automatic detection.',
      cause,
    )
  }
  return validateConfig(value)
}

export function validateConfig(value: unknown): PeekConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidConfig('The default export must be an object.')
  }
  const input = value as Record<string, unknown>
  const allowed = new Set(['command', 'port', 'provider', 'qr'])
  const unknown = Object.keys(input).find((key) => !allowed.has(key))
  if (unknown) throw invalidConfig(`Unknown option ${JSON.stringify(unknown)}.`)
  const config: PeekConfig = {}
  if (input.command !== undefined) {
    const command = input.command
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      Array.from({ length: command.length }, (_, index) => command[index]).some(
        (arg) => typeof arg !== 'string' || arg.length === 0,
      )
    ) {
      throw invalidConfig('command must be a nonempty array of string tokens.')
    }
    config.command = command as string[]
  }
  if (input.port !== undefined) {
    if (
      !Number.isInteger(input.port) ||
      (input.port as number) < 1 ||
      (input.port as number) > 65535
    ) {
      throw invalidConfig('port must be an integer from 1 to 65535.')
    }
    config.port = input.port as number
  }
  if (input.provider !== undefined) {
    if (input.provider !== 'cloudflare')
      throw invalidConfig('provider must be cloudflare.')
    config.provider = 'cloudflare'
  }
  if (input.qr !== undefined) {
    if (typeof input.qr !== 'boolean')
      throw invalidConfig('qr must be a boolean.')
    config.qr = input.qr
  }
  return config
}

function invalidConfig(message: string): PeekError {
  return new PeekError(
    'PROJECT_INVALID',
    `Invalid ${configFile}: ${message}`,
    'Fix the configuration file or remove it to use automatic detection.',
  )
}
