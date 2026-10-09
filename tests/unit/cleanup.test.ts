import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupDev, cleanupProvider } from '../../src/core/cleanup.js'
import type { DevProcess, ProcessExit } from '../../src/core/process.js'
import type { TunnelProvider } from '../../src/tunnel/types.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function dev(exit: Promise<ProcessExit>): DevProcess {
  return {
    pid: 123,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exit,
    waitForStop: () => exit.then(() => {}),
    dispose: vi.fn(),
    kill: vi.fn(),
  }
}

function provider(
  disconnect: () => Promise<void>,
  forceDisconnect?: () => void,
): TunnelProvider {
  return {
    name: 'fixture',
    connect: async () => {
      throw new Error('Unused connect')
    },
    disconnect,
    ...(forceDisconnect ? { forceDisconnect } : {}),
  }
}

const exited: ProcessExit = { exitCode: 0, failed: false, spawnFailed: false }

describe('bounded resource cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    try {
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not confuse root exit with remaining resource shutdown', async () => {
    const stopped = deferred<void>()
    const process = dev(Promise.resolve(exited))
    process.waitForStop = vi.fn(() => stopped.promise)
    process.dispose = vi.fn()
    process.kill = vi.fn((signal) => {
      if (signal === 'SIGKILL') stopped.resolve()
    })
    const result = cleanupDev(process, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2999)
    expect(process.kill).not.toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({})
    expect(process.kill).toHaveBeenCalledWith('SIGKILL')
    expect(process.dispose).toHaveBeenCalledOnce()
  })

  it('forces a dev process after its graceful deadline', async () => {
    const exit = deferred<ProcessExit>()
    const process = dev(exit.promise)
    const result = cleanupDev(process, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2999)
    expect(process.kill).toHaveBeenCalledWith('SIGTERM')
    expect(process.kill).not.toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(1)
    expect(process.kill).toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(1000)
    expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
  })

  it('gives a provider five seconds and one forced second', async () => {
    const disconnected = deferred<void>()
    const force = vi.fn()
    const result = cleanupProvider(
      provider(() => disconnected.promise, force),
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(4999)
    expect(force).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(force).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
  })

  it('disposes graceful-success timers and force listeners', async () => {
    const force = new AbortController()
    const removeListener = vi.spyOn(force.signal, 'removeEventListener')
    expect(
      await cleanupProvider(
        provider(async () => {}),
        force.signal,
      ),
    ).toEqual({})
    expect(
      await cleanupDev(dev(Promise.resolve(exited)), force.signal),
    ).toEqual({})
    expect(removeListener).toHaveBeenCalledTimes(2)
  })

  it('accepts confirmed exit after force', async () => {
    const exit = deferred<ProcessExit>()
    const process = dev(exit.promise)
    process.kill = vi.fn((signal) => {
      if (signal === 'SIGKILL') exit.resolve(exited)
    })
    const result = cleanupDev(process, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await result).toEqual({})
  })

  it('retains provider rejection and still attempts force', async () => {
    const force = vi.fn()
    const failure = new Error('Disconnect failed')
    const result = await cleanupProvider(
      provider(() => Promise.reject(failure), force),
      new AbortController().signal,
    )
    expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
    expect(force).toHaveBeenCalledTimes(1)
  })

  it('bounds a provider without a force hook', async () => {
    const result = cleanupProvider(
      provider(() => new Promise(() => {})),
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(6000)
    expect((await result).error?.message).toMatch(/tunnel/i)
  })

  it('reports a missing provider force hook even if shutdown later settles', async () => {
    const disconnected = deferred<void>()
    const result = cleanupProvider(
      provider(() => disconnected.promise),
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(5000)
    disconnected.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect((await result).error?.message).toMatch(/cannot force termination/)
  })

  it('retains synchronous disconnect exceptions', async () => {
    const force = vi.fn()
    const result = await cleanupProvider(
      provider(() => {
        throw new Error('Broken disconnect')
      }, force),
      new AbortController().signal,
    )
    expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
    expect(force).toHaveBeenCalledTimes(1)
  })

  it('reports a throwing force hook after a bounded exit wait', async () => {
    const disconnected = deferred<void>()
    const result = cleanupProvider(
      provider(
        () => disconnected.promise,
        () => {
          throw new Error('Broken force')
        },
      ),
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(5000)
    disconnected.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect((await result).error?.message).toMatch(/force/i)
  })

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'reports a throwing %s hook',
    async (failingSignal) => {
      const exit = deferred<ProcessExit>()
      const process = dev(exit.promise)
      process.kill = vi.fn((signal) => {
        if (signal === failingSignal) throw new Error('Broken kill')
        if (signal === 'SIGKILL') exit.resolve(exited)
      })
      const result = cleanupDev(process, new AbortController().signal)
      await vi.advanceTimersByTimeAsync(4000)
      expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(process.kill).toHaveBeenCalledWith('SIGKILL')
    },
  )

  it('reports rejected dev exit observation', async () => {
    const process = dev(Promise.reject(new Error('Exit unavailable')))
    const result = await cleanupDev(process, new AbortController().signal)
    expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
    expect(process.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it.each(['dev', 'provider'] as const)(
    'force wakes %s before its graceful deadline',
    async (resource) => {
      const started = Date.now()
      const force = new AbortController()
      const process = dev(new Promise(() => {}))
      const forceDisconnect = vi.fn()
      const result =
        resource === 'dev'
          ? cleanupDev(process, force.signal)
          : cleanupProvider(
              provider(() => new Promise(() => {}), forceDisconnect),
              force.signal,
            )
      await vi.advanceTimersByTimeAsync(10)
      force.abort()
      await vi.advanceTimersByTimeAsync(0)
      if (resource === 'dev')
        expect(process.kill).toHaveBeenCalledWith('SIGKILL')
      else expect(forceDisconnect).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(Date.now() - started).toBe(1010)
    },
  )

  it.each(['dev', 'provider'] as const)(
    'an already requested force bounds %s to one second',
    async (resource) => {
      const force = new AbortController()
      force.abort()
      const result =
        resource === 'dev'
          ? cleanupDev(dev(new Promise(() => {})), force.signal)
          : cleanupProvider(
              provider(() => new Promise(() => {}), vi.fn()),
              force.signal,
            )
      await vi.advanceTimersByTimeAsync(1000)
      expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
    },
  )

  it('cancels resource observation and disposes handles after the forced deadline', async () => {
    const stopped = deferred<void>()
    const process = dev(Promise.resolve(exited))
    let observation: AbortSignal | undefined
    process.waitForStop = (signal) => {
      observation = signal
      return stopped.promise
    }
    const result = cleanupDev(process, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(3999)
    expect(observation?.aborted).toBe(false)
    expect(process.dispose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).error?.message).toContain(
      'Dev resource shutdown could not be confirmed',
    )
    expect(observation?.aborted).toBe(true)
    expect(process.dispose).toHaveBeenCalledOnce()
    stopped.reject(new Error('Late resource observation failure'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('reports synchronous resource observation failure and still disposes', async () => {
    const process = dev(Promise.resolve(exited))
    process.waitForStop = () => {
      throw new Error('Inspection unavailable')
    }
    const result = await cleanupDev(process, new AbortController().signal)
    expect(result.error?.message).toContain(
      'failed to confirm resource shutdown',
    )
    expect(process.kill).toHaveBeenCalledWith('SIGKILL')
    expect(process.dispose).toHaveBeenCalledOnce()
  })

  it('observes late dev rejection after its exit deadline', async () => {
    const exit = deferred<ProcessExit>()
    const result = cleanupDev(dev(exit.promise), new AbortController().signal)
    await vi.advanceTimersByTimeAsync(4000)
    expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
    exit.reject(new Error('Late exit failure'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('observes late rejection after cleanup times out', async () => {
    const disconnected = deferred<void>()
    const result = cleanupProvider(
      provider(() => disconnected.promise),
      new AbortController().signal,
    )
    await vi.advanceTimersByTimeAsync(6000)
    expect((await result).error?.code).toBe('PROCESS_CLEANUP_ERROR')
    disconnected.reject(new Error('Late disconnect failure'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('reports the underlying termination failure once instead of masking it', async () => {
    const cause = new Error('Windows root exited before ancestry was observed')
    const process = dev(Promise.resolve(exited))
    process.kill = vi.fn(() => {
      throw cause
    })
    process.waitForStop = () => Promise.reject(cause)
    const result = await cleanupDev(process, new AbortController().signal)
    expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
    expect(result.error?.message.split('\n')).toEqual([
      'The dev server graceful termination request failed.',
      'Dev server cleanup failed to confirm resource shutdown.',
      'The dev server force termination request failed.',
      `Cleanup cause: ${cause.message}`,
    ])
  })

  it('bounds an inspection payload embedded in the cleanup cause', async () => {
    const cause = new Error(
      `Command failed: powershell.exe -EncodedCommand ${'A'.repeat(2000)}\nDev process inspection returned invalid creation identity evidence.`,
    )
    const process = dev(Promise.resolve(exited))
    process.kill = vi.fn(() => {
      throw cause
    })
    process.waitForStop = () => Promise.reject(cause)
    const result = await cleanupDev(process, new AbortController().signal)
    expect(result.error?.message).toContain(
      'Cleanup cause: `powershell.exe` failed: Dev process inspection returned invalid creation identity evidence.',
    )
    expect(result.error?.message).not.toContain('A'.repeat(500))
  })

  it('reports an inspection timeout through its execution metadata', async () => {
    const cause = Object.assign(
      new Error('Command failed: ps -e -o pid=,pgid=,stat=,lstart='),
      { killed: true, signal: 'SIGKILL', code: null },
    )
    const process = dev(Promise.resolve(exited))
    process.kill = vi.fn(() => {
      throw cause
    })
    process.waitForStop = () => Promise.reject(cause)
    const result = await cleanupDev(process, new AbortController().signal)
    expect(result.error?.message).toContain(
      'Cleanup cause: `ps` failed (signal=SIGKILL, killed)',
    )
  })
})
