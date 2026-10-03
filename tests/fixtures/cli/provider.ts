import { type ChildProcess, spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import type { ProviderPreparation } from '../../../src/cli-command.js'
import type {
  TunnelConnection,
  TunnelExit,
  TunnelProvider,
} from '../../../src/tunnel/types.js'

function journal(record: Record<string, unknown>): void {
  const path = process.env.PEEK_TEST_JOURNAL
  if (!path) throw new Error('Missing fixture journal')
  appendFileSync(path, `${JSON.stringify(record)}\n`)
}

interface Transport {
  child: ChildProcess
  exited: Promise<TunnelExit>
  closed: boolean
  port?: number
}

export function prepareFixtureProvider(
  options: ProviderPreparation,
): TunnelProvider {
  options.signal.throwIfAborted()
  journal({ role: 'preparation', originHostHeader: options.originHostHeader })
  return new FixtureProvider(options.originHostHeader, options.signal)
}

class FixtureProvider implements TunnelProvider {
  readonly name = 'test-loopback'
  private attempt = 0
  private active: Transport | undefined
  private stopping: Promise<void> | undefined

  constructor(
    private readonly originHostHeader: 'localhost' | undefined,
    private readonly shutdownSignal: AbortSignal,
  ) {}

  async connect({
    port,
    signal,
  }: {
    port: number
    signal: AbortSignal
  }): Promise<TunnelConnection> {
    signal.throwIfAborted()
    const attempt = ++this.attempt
    journal({ role: 'connection', attempt, targetPort: port })
    if (process.env.PEEK_TEST_PROVIDER_MODE === 'fail-once' && attempt === 1) {
      throw new Error('Fixture tunnel startup failed once')
    }
    const script = process.env.PEEK_TEST_TRANSPORT
    if (!script) throw new Error('Missing fixture transport path')
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        PEEK_TEST_TARGET_PORT: String(port),
        PEEK_TEST_ATTEMPT: String(attempt),
        ...(this.originHostHeader
          ? { PEEK_TEST_HOST_HEADER: this.originHostHeader }
          : {}),
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    let errorTail = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      errorTail = `${errorTail}${chunk}`.slice(-2000)
    })
    const exited = new Promise<TunnelExit>((resolve) => {
      child.once('close', (exitCode) => {
        state.closed = true
        resolve({ exitCode })
      })
    })
    const state: Transport = { child, exited, closed: false }
    this.active = state
    // Record from the parent too, so a child that crashes before importing its script remains visible.
    journal({ role: 'transport', pid: child.pid, targetPort: port, attempt })
    try {
      const listener = await new Promise<number>((resolve, reject) => {
        const finish = (error?: Error, selectedPort?: number): void => {
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          child.off('message', onMessage)
          child.off('error', onError)
          child.off('close', onClose)
          if (error) reject(error)
          else if (selectedPort !== undefined) resolve(selectedPort)
        }
        const onAbort = (): void =>
          finish(new Error('Fixture transport startup aborted'))
        const onError = (error: Error): void => finish(error)
        const onClose = (): void =>
          finish(
            new Error(
              `Fixture transport closed before listening: ${errorTail}`,
            ),
          )
        const onMessage = (message: unknown): void => {
          if (
            message &&
            typeof message === 'object' &&
            'type' in message &&
            message.type === 'listening' &&
            'port' in message &&
            typeof message.port === 'number' &&
            Number.isInteger(message.port) &&
            message.port > 0 &&
            message.port <= 65535
          )
            finish(undefined, message.port)
        }
        const timeout = setTimeout(
          () =>
            finish(
              new Error(`Fixture transport startup timed out: ${errorTail}`),
            ),
          5000,
        )
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('message', onMessage)
        child.once('error', onError)
        child.once('close', onClose)
        if (signal.aborted) onAbort()
      })
      state.port = listener
      const mode = process.env.PEEK_TEST_PROVIDER_MODE
      if (
        mode === 'connect-pending' ||
        (mode === 'reconnect-pending' && attempt > 1)
      ) {
        journal({
          role: 'connect-pending',
          pid: child.pid,
          port: listener,
          targetPort: port,
          attempt,
        })
        await new Promise<never>((_, reject) => {
          const onAbort = (): void => reject(signal.reason)
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      signal.throwIfAborted()
      return { url: `http://127.0.0.1:${listener}`, exited }
    } catch (error) {
      await this.disconnect()
      throw error
    }
  }

  disconnect(): Promise<void> {
    if (this.stopping) return this.stopping
    const state = this.active
    if (!state) {
      return this.shutdownSignal.aborted &&
        process.env.PEEK_TEST_PROVIDER_MODE === 'disconnect-error'
        ? Promise.reject(new Error('Fixture transport cleanup failed'))
        : Promise.resolve()
    }
    this.stopping = this.stop(state).finally(() => {
      if (this.active === state) this.active = undefined
      this.stopping = undefined
    })
    return this.stopping
  }

  forceDisconnect(): void {
    if (this.active)
      journal({
        role: 'force-disconnect',
        pid: this.active.child.pid,
        port: this.active.port,
      })
    this.active?.child.kill('SIGKILL')
  }

  private async stop(state: Transport): Promise<void> {
    const mode = process.env.PEEK_TEST_PROVIDER_MODE
    if (mode === 'disconnect-on-force' && !state.closed) {
      journal({
        role: 'disconnect-wait',
        pid: state.child.pid,
        port: state.port,
      })
      await state.exited
      return
    }
    await this.stopTransport(state)
    if (mode === 'disconnect-error' && this.shutdownSignal.aborted) {
      journal({
        role: 'disconnect-error',
        pid: state.child.pid,
        port: state.port,
      })
      throw new Error('Fixture transport cleanup failed')
    }
  }

  private async stopTransport(state: Transport): Promise<void> {
    if (state.closed) return
    state.child.kill('SIGTERM')
    if (!(await settlesWithin(state.exited, 2000))) {
      state.child.kill('SIGKILL')
      if (!(await settlesWithin(state.exited, 1000)))
        throw new Error('Fixture transport did not close after SIGKILL')
    }
  }
}

async function settlesWithin(
  promise: Promise<unknown>,
  milliseconds: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds)
  })
  const result = await Promise.race([promise.then(() => true), timeout])
  clearTimeout(timer)
  return result
}
