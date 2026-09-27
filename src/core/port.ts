import { Socket } from 'node:net'
import { PeekError } from '../utils/errors.js'

export const COMMON_DEV_PORTS = [
  3000, 3001, 4173, 4321, 5173, 5174, 8080,
] as const

export function parsePort(value: string): number {
  if (!/^[1-9]\d{0,4}$/.test(value)) {
    throw invalidPort(value)
  }
  const port = Number(value)
  if (port > 65535) throw invalidPort(value)
  return port
}

export function extractLocalPorts(line: string): number[] {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI CSI starts with ESC in framework output.
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '')
  if (/\bmetrics?\b/i.test(clean) && /\/metrics\b/i.test(clean)) return []

  const found = new Set<number>()
  const urlPattern =
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):(\d{1,5})(?=[/\s\])|?#]|$)/gi
  for (const match of clean.matchAll(urlPattern)) {
    const port = safePort(match[1])
    if (port) found.add(port)
  }

  const labelledPattern = /\b(?:port|listening\s+on)\s*:?(\d{1,5})\b/gi
  for (const match of clean.matchAll(labelledPattern)) {
    const port = safePort(match[1])
    if (port) found.add(port)
  }
  return [...found]
}

export function probePort(
  port: number,
  signal?: AbortSignal,
  timeoutMs = 250,
): Promise<boolean> {
  return probeHostPort('127.0.0.1', port, signal, timeoutMs)
}

export function probeHostPort(
  host: string,
  port: number,
  signal?: AbortSignal,
  timeoutMs = 250,
): Promise<boolean> {
  signal?.throwIfAborted()
  return new Promise<boolean>((resolve, reject) => {
    const socket = new Socket()
    let settled = false
    const finish = (value: boolean, error?: unknown): void => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      socket.destroy()
      if (error !== undefined) reject(error)
      else resolve(value)
    }
    const onAbort = (): void =>
      finish(false, signal?.reason ?? new Error('Cancelled'))
    signal?.addEventListener('abort', onAbort, { once: true })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

function safePort(value: string | undefined): number | undefined {
  if (!value) return undefined
  try {
    return parsePort(value)
  } catch {
    return undefined
  }
}

function invalidPort(value: string): PeekError {
  return new PeekError(
    'USAGE_ERROR',
    `Invalid port ${JSON.stringify(value)}.`,
    'Use a number from 1 to 65535, for example: peek --port 3000',
  )
}
