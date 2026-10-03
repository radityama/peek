import type { TunnelProvider } from '../tunnel/types.js'
import { PeekError } from '../utils/errors.js'
import { cleanupDev, cleanupProvider } from './cleanup.js'
import type { DevProcess } from './process.js'

export type LifecyclePhase =
  | 'idle'
  | 'starting-server'
  | 'discovering-server'
  | 'server-ready'
  | 'tunnel-connecting'
  | 'ready'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'

export type LifecycleOutcome =
  | { kind: 'completed' }
  | { kind: 'requested' }
  | { kind: 'failed'; error: unknown }

export interface CleanupResult {
  error?: PeekError
}

const transitions: Record<LifecyclePhase, readonly LifecyclePhase[]> = {
  idle: ['starting-server'],
  'starting-server': ['discovering-server'],
  'discovering-server': ['server-ready'],
  'server-ready': ['tunnel-connecting', 'ready'],
  'tunnel-connecting': ['ready'],
  ready: ['reconnecting'],
  reconnecting: ['ready'],
  stopping: [],
  stopped: [],
}

function cleanupFailure(errors: readonly PeekError[]): CleanupResult {
  if (errors.length === 0) return {}
  return {
    error: new PeekError(
      'PROCESS_CLEANUP_ERROR',
      errors.map((error) => error.message).join('\n'),
      'Check for remaining dev or tunnel processes before starting Peek again.',
      new AggregateError(errors, 'Preview cleanup failed'),
    ),
  }
}

function unexpectedCleanup(error: unknown, message: string): PeekError {
  return new PeekError(
    'PROCESS_CLEANUP_ERROR',
    message,
    'Check for remaining dev or tunnel processes before starting Peek again.',
    error,
  )
}

export class Lifecycle {
  private readonly controller = new AbortController()
  private readonly forceController = new AbortController()
  private dev: DevProcess | undefined
  private provider: TunnelProvider | undefined
  private stopPromise: Promise<CleanupResult> | undefined
  private currentPhase: LifecyclePhase = 'idle'
  private shutdownOutcome: LifecycleOutcome | undefined
  private signalsInstalled = false
  private readonly forceErrors: PeekError[] = []
  private readonly onSigint = (): void => this.handleSignal('SIGINT')
  private readonly onSigterm = (): void => this.handleSignal('SIGTERM')
  signalExitCode: number | undefined

  get phase(): LifecyclePhase {
    return this.currentPhase
  }
  get outcome(): LifecycleOutcome | undefined {
    return this.shutdownOutcome
  }
  get signal(): AbortSignal {
    return this.controller.signal
  }
  get isStopped(): boolean {
    return this.currentPhase === 'stopped'
  }
  get wasRequested(): boolean {
    return this.shutdownOutcome?.kind === 'requested'
  }

  advance(phase: LifecyclePhase): void {
    if (!transitions[this.currentPhase].includes(phase)) {
      throw new Error(
        `Invalid preview transition: ${this.currentPhase} to ${phase}`,
      )
    }
    this.currentPhase = phase
  }

  installSignals(): void {
    if (this.signalsInstalled || this.stopPromise) return
    this.signalsInstalled = true
    process.on('SIGINT', this.onSigint)
    process.on('SIGTERM', this.onSigterm)
  }

  setDev(dev: DevProcess): Promise<void> {
    if (this.dev === dev) return Promise.resolve()
    if (this.stopPromise || this.dev) {
      return this.rejectRegistration(
        cleanupDev(dev, this.forceController.signal),
        !this.stopPromise && this.dev !== undefined,
      )
    }
    this.dev = dev
    // Provider-first shutdown must not leave an early exit rejection unobserved.
    void dev.exit.catch(() => {})
    return Promise.resolve()
  }

  setProvider(provider: TunnelProvider): Promise<void> {
    if (this.provider === provider) return Promise.resolve()
    if (this.stopPromise || this.provider) {
      return this.rejectRegistration(
        cleanupProvider(provider, this.forceController.signal),
        !this.stopPromise && this.provider !== undefined,
      )
    }
    this.provider = provider
    return Promise.resolve()
  }

  requestStop(exitCode?: number): void {
    if (exitCode !== undefined && this.signalExitCode === undefined) {
      this.signalExitCode = exitCode
    }
    if (this.stopPromise) {
      if (!this.isStopped) this.forceStop()
      return
    }
    void this.stop({ kind: 'requested' })
  }

  stop(
    outcome: LifecycleOutcome = { kind: 'completed' },
  ): Promise<CleanupResult> {
    if (this.stopPromise) return this.stopPromise
    let resolve!: (result: CleanupResult) => void
    const promise = new Promise<CleanupResult>((yes) => {
      resolve = yes
    })
    this.stopPromise = promise
    this.shutdownOutcome = outcome
    this.currentPhase = 'stopping'
    this.controller.abort(new Error('Peek was stopped'))
    void Promise.resolve().then(async () => {
      try {
        resolve(await this.stopChildren())
      } catch (error) {
        resolve(
          cleanupFailure([
            unexpectedCleanup(error, 'Preview cleanup failed unexpectedly.'),
          ]),
        )
      }
    })
    return promise
  }

  private async rejectRegistration(
    cleanup: Promise<CleanupResult>,
    replacement: boolean,
  ): Promise<never> {
    const result = await cleanup
    if (result.error) throw result.error
    throw replacement
      ? new Error('Peek already owns a different resource')
      : this.signal.reason
  }

  private async stopChildren(): Promise<CleanupResult> {
    const errors: PeekError[] = []
    try {
      if (this.provider) {
        try {
          const result = await cleanupProvider(
            this.provider,
            this.forceController.signal,
          )
          if (result.error) errors.push(result.error)
        } catch (error) {
          errors.push(
            unexpectedCleanup(error, 'Tunnel cleanup failed unexpectedly.'),
          )
        }
      }
      if (this.dev) {
        try {
          const result = await cleanupDev(this.dev, this.forceController.signal)
          if (result.error) errors.push(result.error)
        } catch (error) {
          errors.push(
            unexpectedCleanup(error, 'Dev server cleanup failed unexpectedly.'),
          )
        }
      }
    } finally {
      process.off('SIGINT', this.onSigint)
      process.off('SIGTERM', this.onSigterm)
      this.signalsInstalled = false
      this.currentPhase = 'stopped'
    }
    return cleanupFailure([...errors, ...this.forceErrors])
  }

  private handleSignal(signal: 'SIGINT' | 'SIGTERM'): void {
    this.requestStop(signal === 'SIGINT' ? 130 : 143)
  }

  private forceStop(): void {
    try {
      this.provider?.forceDisconnect?.()
    } catch (error) {
      this.forceErrors.push(
        unexpectedCleanup(
          error,
          'The tunnel force termination request failed.',
        ),
      )
    }
    try {
      this.dev?.kill('SIGKILL')
    } catch (error) {
      this.forceErrors.push(
        unexpectedCleanup(
          error,
          'The dev server force termination request failed.',
        ),
      )
    }
    this.forceController.abort()
  }
}
