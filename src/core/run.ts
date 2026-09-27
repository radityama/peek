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
  retryDelaysMs?: readonly number[]
}

const DEFAULT_RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]

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
  try {
    signal.throwIfAborted()
    const baselineOpen = await captureBaselinePorts(explicitPort)
    signal.throwIfAborted()
    options.onState?.('starting')
    const dev = spawnDev(command, cwd)
    lifecycle.setDev(dev)
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

    options.onState?.('waiting')
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
    options.onServerReady?.(port)
    if (options.lan) {
      const address = await (options.lanAddressSelector ?? selectLanAddress)(
        port,
        signal,
      )
      options.onLanReady?.(`http://${address}:${port}`)
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
    options.onState?.('connecting')
    lifecycle.setProvider(provider)
    let connection = await provider.connect({ port, signal })
    const reportReady = (): void => {
      const localUrl = `http://localhost:${port}`
      options.onReady?.({
        localUrl,
        publicUrl: connection.url,
      })
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
            for (const finding of findings) options.onPreviewFinding?.(finding)
            options.onPreviewCheckComplete?.()
          },
          () => {
            if (!previewSignal.aborted) options.onPreviewCheckComplete?.()
          },
        )
      }
    }
    reportReady()

    const delays = options.retryDelaysMs?.length
      ? options.retryDelaysMs
      : DEFAULT_RETRY_DELAYS
    while (true) {
      const outcome = await waitForOutcome(connection.exited, dev.exit, signal)
      if (outcome.kind === 'cancel') return
      if (outcome.kind === 'dev') throw serverExit(outcome.exit)

      previewController?.abort()
      options.onState?.('reconnecting')
      let attempt = 0
      while (true) {
        const waitMs = delays[Math.min(attempt, delays.length - 1)] ?? 30_000
        const waited = await waitForOutcome(
          delay(waitMs, undefined, { signal }).catch(() => undefined),
          dev.exit,
          signal,
        )
        if (waited.kind === 'cancel') return
        if (waited.kind === 'dev') throw serverExit(waited.exit)
        signal.throwIfAborted()
        await provider.disconnect()
        try {
          const connected = await waitForOutcome(
            provider.connect({ port, signal }),
            dev.exit,
            signal,
          )
          if (connected.kind === 'cancel') return
          if (connected.kind === 'dev') throw serverExit(connected.exit)
          connection = connected.value
          reportReady()
          break
        } catch (error) {
          if (error instanceof PeekError && error.code === 'SERVER_START_ERROR')
            throw error
          signal.throwIfAborted()
          attempt++
          options.onReconnectFailure?.(
            attempt,
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    }
  } catch (error) {
    if (!lifecycle.wasRequested) throw error
  } finally {
    previewController?.abort()
    await lifecycle.stop()
  }
}
