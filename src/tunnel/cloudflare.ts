import type { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { execa } from 'execa'
import { PeekError } from '../utils/errors.js'
import type { TunnelConnection, TunnelExit, TunnelProvider } from './types.js'

const TUNNEL_TIMEOUT_MS = 45_000

export interface TunnelChild {
  stdout: Readable
  stderr: Readable
  exit: Promise<TunnelExit>
  kill: (signal: NodeJS.Signals) => void
}

export type TunnelLauncher = (binaryPath: string, args: string[]) => TunnelChild

function launchCloudflared(binaryPath: string, args: string[]): TunnelChild {
  const child = execa(binaryPath, args, {
    stdout: 'pipe',
    stderr: 'pipe',
    buffer: false,
    reject: false,
    killDescendants: true,
    cleanup: true,
  })
  if (!child.stdout || !child.stderr) {
    throw new Error('cloudflared output streams were unavailable')
  }
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exit: child.then((result) => ({ exitCode: result.exitCode ?? null })),
    kill: (signal) => {
      child.kill(signal)
    },
  }
}

export function parseTunnelUrl(line: string): string | undefined {
  for (const match of line.matchAll(/https:\/\/[^\s|<>"']+/gi)) {
    const token = match[0].replace(/[),.;\]]+$/, '')
    if (/\.trycloudflare\.com:\d+/i.test(token)) continue
    try {
      const url = new URL(token)
      if (url.protocol !== 'https:') continue
      if (
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/.test(
          url.hostname,
        )
      ) {
        continue
      }
      if (
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        continue
      }
      return url.origin
    } catch {
      // Continue searching the line for another URL.
    }
  }
  return undefined
}

export class CloudflareProvider implements TunnelProvider {
  readonly name = 'cloudflare'
  private child: TunnelChild | undefined
  private readonly diagnostics: string[] = []

  constructor(
    private readonly binaryPath: string,
    private readonly launch: TunnelLauncher = launchCloudflared,
    private readonly onDiagnostic?: (line: string) => void,
  ) {}

  connect(options: {
    port: number
    signal: AbortSignal
  }): Promise<TunnelConnection> {
    const { port, signal } = options
    signal.throwIfAborted()
    this.diagnostics.length = 0
    const child = this.launch(this.binaryPath, [
      'tunnel',
      '--url',
      `http://127.0.0.1:${port}`,
    ])
    this.child = child

    return new Promise<TunnelConnection>((resolve, reject) => {
      let settled = false
      let exited = false
      const settle = (connection?: TunnelConnection, error?: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        if (connection) resolve(connection)
        else reject(error)
      }
      const onAbort = (): void => {
        child.kill('SIGTERM')
        settle(undefined, signal.reason ?? new Error('Cancelled'))
      }
      const onLine = (line: string): void => {
        if (line.trim()) {
          this.diagnostics.push(line)
          if (this.diagnostics.length > 30) this.diagnostics.shift()
          this.onDiagnostic?.(line)
        }
        const url = parseTunnelUrl(line)
        if (url && !exited) settle({ url, exited: child.exit })
      }
      const watchStream = (stream: Readable): void => {
        let pending = ''
        stream.on('data', (chunk: Buffer | string) => {
          pending += chunk.toString()
          const lines = pending.split(/[\r\n]+/)
          pending = lines.pop() ?? ''
          for (const line of lines) onLine(line)
          if (parseTunnelUrl(pending)) onLine(pending)
        })
      }

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        settle(
          undefined,
          new PeekError(
            'TUNNEL_CONNECTION_ERROR',
            'Cloudflare did not provide a public URL within 45 seconds.',
            'Check your network connection and retry with --verbose.',
          ),
        )
      }, TUNNEL_TIMEOUT_MS)
      signal.addEventListener('abort', onAbort, { once: true })
      watchStream(child.stdout)
      watchStream(child.stderr)
      void child.exit.then((result) => {
        exited = true
        settle(undefined, this.exitError(result))
      })
    })
  }

  async disconnect(): Promise<void> {
    const child = this.child
    if (!child) return
    try {
      child.kill('SIGTERM')
      const stopped = await Promise.race([
        child.exit.then(() => true),
        delay(3_000, undefined, { ref: false }).then(() => false),
      ])
      if (!stopped) {
        child.kill('SIGKILL')
        await Promise.race([
          child.exit,
          delay(1_000, undefined, { ref: false }),
        ])
      }
    } finally {
      if (this.child === child) this.child = undefined
    }
  }

  forceDisconnect(): void {
    this.child?.kill('SIGKILL')
  }

  private exitError(result: TunnelExit): PeekError {
    const output = this.diagnostics.join('\n')
    const configConflict = /config\.ya?ml/i.test(output)
    return new PeekError(
      'TUNNEL_CONNECTION_ERROR',
      `Cloudflare tunnel exited before a public URL was available (code ${result.exitCode ?? 'unknown'}).`,
      configConflict
        ? 'A ~/.cloudflared/config.yaml may block Quick Tunnels. Move it temporarily and retry.'
        : 'Check your internet connection and retry with --verbose.',
      output,
    )
  }
}
