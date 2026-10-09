import type { TunnelProvider } from '../tunnel/types.js'
import { PeekError } from '../utils/errors.js'
import type { CleanupResult } from './lifecycle.js'
import type { DevProcess } from './process.js'

type WaitResult =
  | { kind: 'fulfilled' }
  | { kind: 'rejected'; error: unknown }
  | { kind: 'timeout' }
  | { kind: 'forced' }

async function boundedWait(
  promise: Promise<unknown>,
  milliseconds: number,
  force?: AbortSignal,
): Promise<WaitResult> {
  const settled = promise.then<WaitResult, WaitResult>(
    () => ({ kind: 'fulfilled' }),
    (error: unknown) => ({ kind: 'rejected', error }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  let onForce: (() => void) | undefined
  const deadline = new Promise<WaitResult>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), milliseconds)
    if (force) {
      onForce = () => resolve({ kind: 'forced' })
      force.addEventListener('abort', onForce, { once: true })
      if (force.aborted) onForce()
    }
  })
  try {
    return await Promise.race([settled, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (force && onForce) force.removeEventListener('abort', onForce)
  }
}

const diagnosticLimit = 400

// execFile embeds its full argv in the error message, and a process-inspection
// job can carry a large encoded payload. Keep the stderr detail that follows
// the command line and bound whatever is reported.
function diagnostic(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const detail =
    lines[0]?.startsWith('Command failed:') === true
      ? lines.slice(1).join(' ')
      : lines.join(' ')
  const bounded = detail.length > 0 ? detail : (lines[0] ?? '')
  return bounded.length > diagnosticLimit
    ? `${bounded.slice(0, diagnosticLimit)}...`
    : bounded
}

function failure(
  messages: readonly string[],
  causes: readonly unknown[],
): CleanupResult {
  if (messages.length === 0) return {}
  const details = [
    ...new Set(causes.map(diagnostic).filter((detail) => detail.length > 0)),
  ]
  return {
    error: new PeekError(
      'PROCESS_CLEANUP_ERROR',
      [
        ...messages,
        ...details.map((detail) => `Cleanup cause: ${detail}`),
      ].join('\n'),
      'Check for remaining dev or tunnel processes before starting Peek again.',
      new AggregateError(causes, 'Resource cleanup failed'),
    ),
  }
}

export async function cleanupProvider(
  provider: TunnelProvider,
  force: AbortSignal,
): Promise<CleanupResult> {
  const messages: string[] = []
  const causes: unknown[] = []
  let disconnected: Promise<void>
  try {
    disconnected = provider.disconnect()
  } catch (error) {
    disconnected = Promise.reject(error)
  }
  const graceful = await boundedWait(disconnected, 5_000, force)
  if (graceful.kind === 'fulfilled') return {}
  if (graceful.kind === 'rejected') {
    messages.push('Tunnel cleanup failed to confirm shutdown.')
    causes.push(graceful.error)
  }
  if (provider.forceDisconnect) {
    try {
      provider.forceDisconnect()
    } catch (error) {
      messages.push('The tunnel force termination request failed.')
      causes.push(error)
    }
  } else {
    messages.push(
      'The tunnel provider cannot force termination after graceful cleanup failed.',
    )
  }
  const forced = await boundedWait(disconnected, 1_000)
  if (forced.kind !== 'fulfilled' && graceful.kind !== 'rejected') {
    messages.push(
      'Tunnel shutdown could not be confirmed within its cleanup deadline.',
    )
    if (forced.kind === 'rejected') causes.push(forced.error)
  }
  return failure(messages, causes)
}

export async function cleanupDev(
  dev: DevProcess,
  force: AbortSignal,
): Promise<CleanupResult> {
  const messages: string[] = []
  const causes: unknown[] = []
  const observation = new AbortController()
  let stopped: Promise<void>
  try {
    stopped = dev.waitForStop(observation.signal)
  } catch (error) {
    stopped = Promise.reject(error)
  }
  try {
    const gracefulWait = boundedWait(stopped, 3_000, force)
    try {
      dev.kill('SIGTERM')
    } catch (error) {
      messages.push('The dev server graceful termination request failed.')
      causes.push(error)
    }
    const graceful = await gracefulWait
    if (graceful.kind === 'fulfilled') return failure(messages, causes)
    if (graceful.kind === 'rejected') {
      messages.push('Dev server cleanup failed to confirm resource shutdown.')
      causes.push(graceful.error)
    }
    try {
      dev.kill('SIGKILL')
    } catch (error) {
      messages.push('The dev server force termination request failed.')
      causes.push(error)
    }
    const forced = await boundedWait(stopped, 1_000)
    if (forced.kind !== 'fulfilled' && graceful.kind !== 'rejected') {
      messages.push(
        'Dev resource shutdown could not be confirmed within its cleanup deadline.',
      )
      if (forced.kind === 'rejected') causes.push(forced.error)
    }
    return failure(messages, causes)
  } finally {
    observation.abort()
    dev.dispose()
  }
}
