import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type { TunnelProvider } from '../tunnel/types.js'
import { PeekError } from '../utils/errors.js'
import type { DevCommand } from './dev-command.js'
import type { Framework } from './framework.js'
import { selectLanAddress } from './lan.js'
import type { Lifecycle } from './lifecycle.js'
import { checkPreview, type PreviewFinding } from './preview-checks.js'
import {
  isMissingWindowsCommand,
  type ProcessExit,
  spawnDev,
} from './process.js'
import { TunnelRecovery } from './reconnect.js'
import {
  captureBaselinePorts,
  inspectChildListeningPorts,
  PortSignals,
  waitForServer,
} from './server.js'

export interface RunOptions {
  cwd: string
  command: DevCommand
  explicitPort?: number
  lifecycle: Lifecycle
  provider?: TunnelProvider
  lan?: boolean
  lanAddressSelector?: (port: number, signal: AbortSignal) => Promise<string>
  onState?: (
    state: 'starting' | 'waiting' | 'connecting' | 'reconnecting',
  ) => void
  onDevOutput?: (stream: 'stdout' | 'stderr', text: string) => void
  onServerReady?: (port: number) => void
  onReady?: (urls: { localUrl: string; publicUrl: string }) => void
  onLanReady?: (url: string) => void
  framework?: Framework
  onPreviewFinding?: (finding: PreviewFinding) => void
  onPreviewCheckComplete?: () => void
  previewCheck?: typeof checkPreview
  onReconnectFailure?: (attempt: number, message: string) => void
  onTunnelDrop?: (message: string) => void
  retryDelaysMs?: readonly number[]
  now?: () => number
}

async function waitForOutcome<T>(
  value: Promise<T>,
  devExit: Promise<ProcessExit>,
  signal: AbortSignal,
): Promise<
  | { kind: 'value'; value: T }
  | { kind: 'dev'; exit: ProcessExit }
  | { kind: 'cancel' }
> {
  let removeAbort: (() => void) | undefined
  const cancelled = new Promise<{ kind: 'cancel' }>((resolve) => {
    const onAbort = (): void => resolve({ kind: 'cancel' })
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    removeAbort = () => signal.removeEventListener('abort', onAbort)
  })
  try {
    return await Promise.race([
      value.then((result) => ({ kind: 'value' as const, value: result })),
      devExit.then((exit) => ({ kind: 'dev' as const, exit })),
      cancelled,
    ])
  } finally {
    removeAbort?.()
  }
}

function serverExit(exit: ProcessExit): PeekError {
  return new PeekError(
    'SERVER_START_ERROR',
    `Development server exited with code ${exit.exitCode ?? 'unknown'}.`,
    'Check the server output above and restart Peek after fixing the problem.',
    exit.message,
  )
}

export async function runPeek(options: RunOptions): Promise<void> {
  const { cwd, command, explicitPort, lifecycle, provider } = options
  const signal = lifecycle.signal
  let previewController: AbortController | undefined
  let primary: { error: unknown } | undefined
  try {
    if (provider) await lifecycle.setProvider(provider)
    signal.throwIfAborted()
    const baselineOpen = await captureBaselinePorts(explicitPort)
    signal.throwIfAborted()
    lifecycle.advance('starting-server')
    options.onState?.('starting')
    signal.throwIfAborted()
    const dev = spawnDev(command, cwd)
    await lifecycle.setDev(dev)
    signal.throwIfAborted()
    const signals = new PortSignals()
    dev.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      signals.addChunk(text)
      options.onDevOutput?.('stdout', text)
    })
    dev.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      signals.addChunk(text)
      options.onDevOutput?.('stderr', text)
    })
    let devExited = false
    let devExit: ProcessExit | undefined
    void dev.exit.then((exit) => {
      devExited = true
      devExit = exit
    })

    lifecycle.advance('discovering-server')
    options.onState?.('waiting')
    signal.throwIfAborted()
    let port: number
    try {
      port = await waitForServer({
        ...(explicitPort === undefined ? {} : { explicitPort }),
        signals,
        baselineOpen,
        signal,
        hasExited: () => devExited,
        inspectPorts: () => inspectChildListeningPorts(dev.pid),
      })
    } catch (error) {
      if (
        error instanceof PeekError &&
        error.code === 'SERVER_START_ERROR' &&
        devExit &&
        (devExit.spawnFailed ||
          (devExit.failed &&
            (await isMissingWindowsCommand(command.file, cwd))))
      ) {
        throw new PeekError(
          'PACKAGE_MANAGER_ERROR',
          `Peek could not start ${command.file}.`,
          `Install ${command.file} or run an available command with peek -- <command>.`,
          devExit?.message,
        )
      }
      if (
        error instanceof PeekError &&
        error.code === 'SERVER_START_ERROR' &&
        devExit
      ) {
        throw new PeekError(
          'SERVER_START_ERROR',
          `Development server exited with code ${devExit.exitCode ?? 'unknown'} before becoming ready.`,
          'Check the dev server output above and fix its startup error.',
          devExit.message,
        )
      }
      throw error
    }
    signal.throwIfAborted()
    lifecycle.advance('server-ready')
    options.onServerReady?.(port)
    signal.throwIfAborted()
    if (options.lan) {
      const address = await (options.lanAddressSelector ?? selectLanAddress)(
        port,
        signal,
      )
      signal.throwIfAborted()
      lifecycle.advance('ready')
      options.onLanReady?.(`http://${address}:${port}`)
      signal.throwIfAborted()
      const outcome = await waitForOutcome(
        new Promise<never>(() => {}),
        dev.exit,
        signal,
      )
      if (outcome.kind === 'dev') throw serverExit(outcome.exit)
      return
    }
    if (!provider)
      throw new Error('Tunnel provider is required outside LAN mode')
    lifecycle.advance('tunnel-connecting')
    options.onState?.('connecting')
    signal.throwIfAborted()
    const reportReady = (connection: { url: string }): void => {
      signal.throwIfAborted()
      lifecycle.advance('ready')
      const localUrl = `http://localhost:${port}`
      options.onReady?.({
        localUrl,
        publicUrl: connection.url,
      })
      signal.throwIfAborted()
      if (options.framework) {
        previewController?.abort()
        previewController = new AbortController()
        const previewSignal = AbortSignal.any([
          signal,
          previewController.signal,
        ])
        void (options.previewCheck ?? checkPreview)(
          localUrl,
          connection.url,
          options.framework,
          previewSignal,
        ).then(
          (findings) => {
            if (previewSignal.aborted) return
            for (const finding of findings) {
              if (previewSignal.aborted) return
              options.onPreviewFinding?.(finding)
            }
            if (previewSignal.aborted) return
            options.onPreviewCheckComplete?.()
          },
          () => {
            if (!previewSignal.aborted) options.onPreviewCheckComplete?.()
          },
        )
      }
    }
    const recovery = new TunnelRecovery(options.retryDelaysMs)
    const now = options.now ?? (() => performance.now())
    let connectedAt = 0
    let failureCount = 0
    let connection: Awaited<ReturnType<TunnelProvider['connect']>> | undefined
    while (true) {
      while (!connection) {
        const waitMs = recovery.delayMs
        if (waitMs > 0) {
          const waited = await waitForOutcome(
            delay(waitMs, undefined, { signal }).catch(() => undefined),
            dev.exit,
            signal,
          )
          if (waited.kind === 'cancel') return
          if (waited.kind === 'dev') throw serverExit(waited.exit)
          signal.throwIfAborted()
        }
        signal.throwIfAborted()
        const disconnected = await waitForOutcome(
          provider.disconnect(),
          dev.exit,
          signal,
        )
        if (disconnected.kind === 'cancel') return
        if (disconnected.kind === 'dev') throw serverExit(disconnected.exit)
        signal.throwIfAborted()
        try {
          const connected = await waitForOutcome(
            provider.connect({
              target: new URL(`http://127.0.0.1:${port}`),
              signal,
            }),
            dev.exit,
            signal,
          )
          if (connected.kind === 'cancel') return
          if (connected.kind === 'dev') throw serverExit(connected.exit)
          signal.throwIfAborted()
          connection = connected.value
          connectedAt = now()
        } catch (error) {
          if (
            error instanceof PeekError &&
            (error.code === 'SERVER_START_ERROR' ||
              error.code === 'TUNNEL_CONFIG_ERROR')
          )
            throw error
          signal.throwIfAborted()
          failureCount++
          options.onReconnectFailure?.(
            failureCount,
            error instanceof Error ? error.message : String(error),
          )
          signal.throwIfAborted()
          recovery.failed(error)
        }
      }
      reportReady(connection)
      const outcome = await waitForOutcome(connection.exited, dev.exit, signal)
      if (outcome.kind === 'cancel') return
      if (outcome.kind === 'dev') throw serverExit(outcome.exit)
      signal.throwIfAborted()
      options.onTunnelDrop?.(
        `Tunnel exited with code ${outcome.value.exitCode ?? 'unknown'}.`,
      )
      signal.throwIfAborted()
      previewController?.abort()
      lifecycle.advance('reconnecting')
      options.onState?.('reconnecting')
      signal.throwIfAborted()
      recovery.dropped(now() - connectedAt)
      connection = undefined
    }
  } catch (error) {
    const cancelled =
      signal.aborted &&
      (error === signal.reason ||
        (lifecycle.wasRequested &&
          error instanceof Error &&
          error.name === 'AbortError'))
    if (
      !cancelled ||
      (error instanceof PeekError && error.code === 'PROCESS_CLEANUP_ERROR')
    ) {
      primary = { error }
    }
  } finally {
    previewController?.abort()
    const cleanup = await lifecycle.stop(
      primary ? { kind: 'failed', error: primary.error } : undefined,
    )
    // biome-ignore lint/correctness/noUnsafeFinally: The original failure must survive cleanup.
    if (primary) throw primary.error
    // biome-ignore lint/correctness/noUnsafeFinally: Cleanup failure must reject a successful or cancelled return.
    if (cleanup.error) throw cleanup.error
  }
}
