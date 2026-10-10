import type { Readable } from 'node:stream'
import { execa } from 'execa'
import { PeekError } from '../utils/errors.js'
import { consumeOutputLines } from '../utils/output-lines.js'
import type { TunnelExit, TunnelProvider, TunnelSession } from './types.js'

const TUNNEL_TIMEOUT_MS = 45_000

export interface TunnelChild {
  stdout: Readable
  stderr: Readable
  exit: Promise<TunnelExit>
  kill: (signal: NodeJS.Signals) => void
}

export type TunnelLauncher = (binaryPath: string, args: string[]) => TunnelChild

async function waitForExit(
  exit: Promise<TunnelExit>,
  milliseconds: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds)
    timer.unref()
  })
  try {
    return await Promise.race([exit.then(() => true), deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

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

function targetArgument(target: URL): string {
  const port = Number(target.port || 80)
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new PeekError(
      'TUNNEL_CONFIG_ERROR',
      'Tunnel target must be a root HTTP URL on 127.0.0.1.',
      'Use http://127.0.0.1:<port>/ with port 1-65535 and no credentials, query, or fragment.',
    )
  }
  return `http://${target.hostname}:${port}`
}

export class CloudflareProvider implements TunnelProvider {
  readonly name = 'cloudflare'
  private child: TunnelChild | undefined
  private stopping: Promise<void> | undefined
  private launching = false
  private readonly diagnostics: string[] = []

  constructor(
    private readonly binaryPath: string,
    private readonly launch: TunnelLauncher = launchCloudflared,
    private readonly onDiagnostic?: (line: string) => void,
    private readonly originHostHeader?: 'localhost',
  ) {}

  connect(options: {
    target: URL
    signal: AbortSignal
  }): Promise<TunnelSession> {
    const { target, signal } = options
    signal.throwIfAborted()
    const origin = targetArgument(target)
    if (this.child || this.stopping || this.launching) {
      throw new PeekError(
        'TUNNEL_CONFIG_ERROR',
        'Cloudflare already owns a pending or active tunnel.',
        'Wait for disconnect to confirm tunnel shutdown before connecting again.',
      )
    }
    this.diagnostics.length = 0
    const args = ['tunnel', '--url', origin]
    if (this.originHostHeader) args.push('--http-host-header', 'localhost')
    let child: TunnelChild
    this.launching = true
    try {
      child = this.launch(this.binaryPath, args)
      this.child = child
    } finally {
      this.launching = false
    }

    return new Promise<TunnelSession>((resolve, reject) => {
      let settled = false
      let exited = false
      const settle = (connection?: TunnelSession, error?: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        if (connection) resolve(connection)
        else reject(error)
      }
      const onAbort = (): void => {
        settle(undefined, signal.reason ?? new Error('Cancelled'))
        child.kill('SIGTERM')
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
      const watchStream = (stream: Readable): (() => void) => {
        let pending = ''
        const onData = (chunk: Buffer | string): void => {
          const consumed = consumeOutputLines(pending, chunk.toString())
          pending = consumed.pending
          for (const line of consumed.lines) onLine(line)
          if (parseTunnelUrl(pending)) onLine(pending)
        }
        stream.on('data', onData)
        return () => {
          stream.removeListener('data', onData)
          pending = ''
        }
      }

      const timeout = setTimeout(() => {
        settle(
          undefined,
          new PeekError(
            'TUNNEL_CONNECTION_ERROR',
            'Cloudflare did not provide a public URL within 45 seconds.',
            'Check your network connection and retry with --verbose.',
          ),
        )
        child.kill('SIGTERM')
      }, TUNNEL_TIMEOUT_MS)
      signal.addEventListener('abort', onAbort, { once: true })
      const removeStreams = [
        watchStream(child.stdout),
        watchStream(child.stderr),
      ]
      const finishStreams = (): void => {
        exited = true
        for (const remove of removeStreams) remove()
      }
      void child.exit.then(
        (result) => {
          finishStreams()
          if (this.child === child) this.child = undefined
          settle(undefined, this.exitError(result))
        },
        (error: unknown) => {
          finishStreams()
          settle(undefined, error)
        },
      )
      if (signal.aborted) onAbort()
    })
  }

  disconnect(): Promise<void> {
    if (this.stopping) return this.stopping
    const child = this.child
    if (!child) return Promise.resolve()
    const stopping = Promise.resolve().then(() => this.stopChild(child))
    this.stopping = stopping
    const release = (): void => {
      if (this.stopping === stopping) this.stopping = undefined
    }
    void stopping.then(release, release)
    return stopping
  }

  private async stopChild(child: TunnelChild): Promise<void> {
    child.kill('SIGTERM')
    if (!(await waitForExit(child.exit, 3_000))) {
      child.kill('SIGKILL')
      if (!(await waitForExit(child.exit, 1_000))) {
        throw new PeekError(
          'PROCESS_CLEANUP_ERROR',
          'Cloudflare tunnel exit could not be confirmed after force termination.',
          'Check for a remaining cloudflared process before starting Peek again.',
        )
      }
    }
    if (this.child === child) this.child = undefined
  }

  forceDisconnect(): void {
    this.child?.kill('SIGKILL')
  }

  private exitError(result: TunnelExit): PeekError {
    const output = this.diagnostics.join('\n')
    const configConflict = /config\.ya?ml/i.test(output)
    return new PeekError(
      configConflict ? 'TUNNEL_CONFIG_ERROR' : 'TUNNEL_CONNECTION_ERROR',
      `Cloudflare tunnel exited before a public URL was available (code ${result.exitCode ?? 'unknown'}).`,
      configConflict
        ? 'A ~/.cloudflared/config.yaml may block Quick Tunnels. Move it temporarily and retry.'
        : 'Check your internet connection and retry with --verbose.',
      output,
    )
  }
}
