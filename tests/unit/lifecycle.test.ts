import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { type CleanupResult, Lifecycle } from '../../src/core/lifecycle.js'
import type { DevProcess } from '../../src/core/process.js'
import type { TunnelProvider } from '../../src/tunnel/types.js'

function provider(
  disconnect: () => Promise<void> = vi.fn(async () => {}),
): TunnelProvider {
  return {
    name: 'fixture',
    connect: async () => {
      throw new Error('Unused connect')
    },
    disconnect,
  }
}

function dev(): DevProcess {
  return {
    pid: 123,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exit: Promise.resolve({ exitCode: 0, failed: false, spawnFailed: false }),
    kill: vi.fn(),
  }
}

describe('Lifecycle', () => {
  it('publishes one shutdown promise before provider cleanup re-enters', async () => {
    const lifecycle = new Lifecycle()
    let reentered: Promise<CleanupResult> | undefined
    const disconnect = vi.fn(() => {
      reentered = lifecycle.stop()
      return Promise.resolve()
    })
    await lifecycle.setProvider(provider(disconnect))
    const stopped = lifecycle.stop()
    expect(await stopped).toEqual({})
    expect(reentered).toBe(stopped)
    expect(lifecycle.stop()).toBe(stopped)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(lifecycle.signal.aborted).toBe(true)
    expect(lifecycle.phase).toBe('stopped')
  })

  it('rejects progress that skips server verification', async () => {
    const lifecycle = new Lifecycle()
    expect(() => lifecycle.advance('ready')).toThrow()
    expect(lifecycle.phase).toBe('idle')
    await lifecycle.stop()
    expect(() => lifecycle.advance('starting-server')).toThrow()
    expect(lifecycle.phase).toBe('stopped')
  })

  it.each([true, false])(
    'checks the public/LAN path (public=%s)',
    async (publicMode) => {
      const lifecycle = new Lifecycle()
      lifecycle.advance('starting-server')
      lifecycle.advance('discovering-server')
      lifecycle.advance('server-ready')
      if (publicMode) lifecycle.advance('tunnel-connecting')
      lifecycle.advance('ready')
      expect(lifecycle.phase).toBe('ready')
      lifecycle.advance('reconnecting')
      lifecycle.advance('ready')
      await lifecycle.stop()
    },
  )

  it('retains the first failure and aborts direct stop before startup', async () => {
    const lifecycle = new Lifecycle()
    const error = new Error('Startup failed')
    const stopped = lifecycle.stop({ kind: 'failed', error })
    expect(lifecycle.phase).toBe('stopping')
    expect(lifecycle.signal.aborted).toBe(true)
    expect(lifecycle.isStopped).toBe(false)
    expect(lifecycle.stop({ kind: 'requested' })).toBe(stopped)
    await stopped
    expect(lifecycle.outcome).toEqual({ kind: 'failed', error })
    expect(lifecycle.wasRequested).toBe(false)
    expect(lifecycle.isStopped).toBe(true)
  })

  it('publishes shutdown before abort listeners re-enter', async () => {
    const lifecycle = new Lifecycle()
    let reentered: Promise<CleanupResult> | undefined
    lifecycle.signal.addEventListener('abort', () => {
      reentered = lifecycle.stop()
    })
    const stopped = lifecycle.stop()
    expect(reentered).toBe(stopped)
    expect(await stopped).toEqual({})
    expect(lifecycle.outcome).toEqual({ kind: 'completed' })
  })

  it('installs one owned signal pair and removes it after stop', async () => {
    const lifecycle = new Lifecycle()
    const intListeners = process.listeners('SIGINT')
    const termListeners = process.listeners('SIGTERM')
    try {
      lifecycle.installSignals()
      lifecycle.installSignals()
      const addedInt = process
        .listeners('SIGINT')
        .filter((listener) => !intListeners.includes(listener))
      const addedTerm = process
        .listeners('SIGTERM')
        .filter((listener) => !termListeners.includes(listener))
      expect(addedInt).toHaveLength(1)
      expect(addedTerm).toHaveLength(1)
      addedInt[0]?.('SIGINT')
      addedTerm[0]?.('SIGTERM')
      await lifecycle.stop()
      expect(lifecycle.signalExitCode).toBe(130)
      expect(lifecycle.wasRequested).toBe(true)
      expect(lifecycle.outcome).toEqual({ kind: 'requested' })
      lifecycle.installSignals()
      expect(process.listeners('SIGINT')).not.toContain(addedInt[0])
      expect(process.listeners('SIGTERM')).not.toContain(addedTerm[0])
    } finally {
      await lifecycle.stop()
    }
  })

  it('registers synchronously and treats the same objects as idempotent', async () => {
    const lifecycle = new Lifecycle()
    const process = dev()
    const tunnel = provider()
    const registration = lifecycle.setDev(process)
    const providerRegistration = lifecycle.setProvider(tunnel)
    await lifecycle.setDev(process)
    await lifecycle.setProvider(tunnel)
    await lifecycle.stop()
    await registration
    await providerRegistration
    expect(process.kill).toHaveBeenCalledTimes(1)
    expect(tunnel.disconnect).toHaveBeenCalledTimes(1)
  })

  it('closes replacements while retaining the owned resources', async () => {
    const lifecycle = new Lifecycle()
    const ownedDev = dev()
    const ownedProvider = provider()
    const rejectedDev = dev()
    const rejectedProvider = provider()
    await lifecycle.setDev(ownedDev)
    await lifecycle.setProvider(ownedProvider)
    await expect(lifecycle.setDev(rejectedDev)).rejects.toThrow(/already/i)
    await expect(lifecycle.setProvider(rejectedProvider)).rejects.toThrow(
      /already/i,
    )
    expect(rejectedDev.kill).toHaveBeenCalledWith('SIGTERM')
    expect(rejectedProvider.disconnect).toHaveBeenCalledTimes(1)
    await lifecycle.stop()
    expect(ownedDev.kill).toHaveBeenCalledWith('SIGTERM')
    expect(ownedProvider.disconnect).toHaveBeenCalledTimes(1)
  })

  it('closes late resources without changing the completed result', async () => {
    const lifecycle = new Lifecycle()
    const stopped = lifecycle.stop()
    const result = await stopped
    const lateDev = dev()
    const lateProvider = provider()
    await expect(lifecycle.setDev(lateDev)).rejects.toThrow(/stopped/i)
    await expect(lifecycle.setProvider(lateProvider)).rejects.toThrow(
      /stopped/i,
    )
    expect(lateDev.kill).toHaveBeenCalledWith('SIGTERM')
    expect(lateProvider.disconnect).toHaveBeenCalledTimes(1)
    expect(await lifecycle.stop()).toBe(result)
    expect(lifecycle.phase).toBe('stopped')
  })

  it('stops every active phase', async () => {
    for (const phase of [
      'idle',
      'starting-server',
      'discovering-server',
      'server-ready',
      'tunnel-connecting',
      'ready',
      'reconnecting',
    ] as const) {
      const lifecycle = new Lifecycle()
      for (const next of [
        'starting-server',
        'discovering-server',
        'server-ready',
        'tunnel-connecting',
        'ready',
        'reconnecting',
      ] as const) {
        if (lifecycle.phase === phase) break
        lifecycle.advance(next)
      }
      await lifecycle.stop()
      expect(lifecycle.phase).toBe('stopped')
      expect(lifecycle.signal.aborted).toBe(true)
    }
  })

  it('cleans a stalled provider before the dev within the total budget', async () => {
    vi.useFakeTimers()
    try {
      const lifecycle = new Lifecycle()
      const process = dev()
      await lifecycle.setProvider(provider(() => new Promise(() => {})))
      await lifecycle.setDev(process)
      const stopped = lifecycle.stop()
      await vi.advanceTimersByTimeAsync(5999)
      expect(process.kill).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(process.kill).toHaveBeenCalledWith('SIGTERM')
      expect((await stopped).error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(lifecycle.phase).toBe('stopped')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forces both owned resources and collects force-hook exceptions', async () => {
    vi.useFakeTimers()
    const lifecycle = new Lifecycle()
    const originalInt = process.listeners('SIGINT')
    const originalTerm = process.listeners('SIGTERM')
    try {
      const process = dev()
      const tunnel = provider(() => new Promise(() => {}))
      tunnel.forceDisconnect = vi.fn(() => {
        throw new Error('Force refused')
      })
      await lifecycle.setDev(process)
      await lifecycle.setProvider(tunnel)
      lifecycle.installSignals()
      lifecycle.requestStop(130)
      await vi.advanceTimersByTimeAsync(10)
      lifecycle.requestStop(143)
      expect(process.kill).toHaveBeenCalledWith('SIGKILL')
      await vi.advanceTimersByTimeAsync(1000)
      const result = await lifecycle.stop()
      expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(result.error?.message).toMatch(/force termination/)
      expect(lifecycle.signalExitCode).toBe(130)
      expect(lifecycle.outcome).toEqual({ kind: 'requested' })
      expect(lifecycle.phase).toBe('stopped')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await vi.advanceTimersByTimeAsync(10_000)
      await lifecycle.stop()
      expect(process.listeners('SIGINT')).toEqual(originalInt)
      expect(process.listeners('SIGTERM')).toEqual(originalTerm)
      vi.useRealTimers()
    }
  })

  it('awaits late cleanup and reports its failure without changing stop', async () => {
    vi.useFakeTimers()
    try {
      const lifecycle = new Lifecycle()
      const stopped = lifecycle.stop()
      const result = await stopped
      const lateProvider = provider(() => new Promise(() => {}))
      const registration = lifecycle.setProvider(lateProvider)
      const rejected = expect(registration).rejects.toMatchObject({
        code: 'PROCESS_CLEANUP_ERROR',
      })
      await vi.advanceTimersByTimeAsync(5999)
      expect(lifecycle.phase).toBe('stopped')
      await vi.advanceTimersByTimeAsync(1)
      await rejected
      expect(await lifecycle.stop()).toBe(result)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retains the requested outcome without inventing a signal code', async () => {
    const lifecycle = new Lifecycle()
    lifecycle.requestStop()
    await lifecycle.stop({ kind: 'failed', error: new Error('Late failure') })
    expect(lifecycle.outcome).toEqual({ kind: 'requested' })
    expect(lifecycle.signalExitCode).toBeUndefined()
  })

  it.each([
    ['failed', 'SIGINT', 130],
    ['failed', 'SIGTERM', 143],
    ['completed', 'SIGINT', 130],
    ['completed', 'SIGTERM', 143],
    ['requested', 'SIGINT', 130],
    ['requested', 'SIGTERM', 143],
  ] as const)(
    'records the first %s-cleanup signal %s and retains its exit code',
    async (kind, signal, exitCode) => {
      vi.useFakeTimers()
      const lifecycle = new Lifecycle()
      const intListeners = process.listeners('SIGINT')
      const termListeners = process.listeners('SIGTERM')
      try {
        lifecycle.installSignals()
        const onInt = process
          .listeners('SIGINT')
          .find((listener) => !intListeners.includes(listener))
        const onTerm = process
          .listeners('SIGTERM')
          .find((listener) => !termListeners.includes(listener))
        await lifecycle.setProvider(provider(() => new Promise(() => {})))
        if (kind === 'requested') lifecycle.requestStop()
        else if (kind === 'failed')
          lifecycle.stop({ kind, error: new Error('Original failure') })
        else lifecycle.stop({ kind })
        const stopped = lifecycle.stop()
        const outcome = lifecycle.outcome
        await vi.advanceTimersByTimeAsync(10)
        expect(lifecycle.phase).toBe('stopping')
        expect(lifecycle.signalExitCode).toBeUndefined()
        if (signal === 'SIGINT') onInt?.(signal)
        else onTerm?.(signal)
        expect(lifecycle.signalExitCode).toBe(exitCode)
        if (signal === 'SIGINT') onTerm?.('SIGTERM')
        else onInt?.('SIGINT')
        expect(lifecycle.signalExitCode).toBe(exitCode)
        expect(lifecycle.outcome).toBe(outcome)
        expect(lifecycle.stop()).toBe(stopped)
        await vi.advanceTimersByTimeAsync(1000)
        expect((await stopped).error?.code).toBe('PROCESS_CLEANUP_ERROR')
        expect(lifecycle.phase).toBe('stopped')
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        try {
          await vi.advanceTimersByTimeAsync(10_000)
          await lifecycle.stop()
          expect(process.listeners('SIGINT')).toEqual(intListeners)
          expect(process.listeners('SIGTERM')).toEqual(termListeners)
        } finally {
          vi.useRealTimers()
        }
      }
    },
  )

  it('cleans registration during stopping without acquiring the resource', async () => {
    const lifecycle = new Lifecycle()
    const stopped = lifecycle.stop()
    const lateDev = dev()
    await expect(lifecycle.setDev(lateDev)).rejects.toThrow('Peek was stopped')
    expect(lateDev.kill).toHaveBeenCalledTimes(1)
    expect(await stopped).toEqual({})
    expect(lifecycle.outcome).toEqual({ kind: 'completed' })
  })

  it('preserves failure outcome while collecting both resource failures within ten seconds', async () => {
    vi.useFakeTimers()
    try {
      const lifecycle = new Lifecycle()
      const failure = new Error('Original preview failure')
      const process = dev()
      process.exit = new Promise(() => {})
      await lifecycle.setDev(process)
      await lifecycle.setProvider(provider(() => new Promise(() => {})))
      const stopped = lifecycle.stop({ kind: 'failed', error: failure })
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await stopped
      expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(result.error?.message).toMatch(/Tunnel shutdown/)
      expect(result.error?.message).toMatch(/Dev server exit/)
      expect(result.error?.cause).toBeInstanceOf(AggregateError)
      expect(lifecycle.outcome).toEqual({ kind: 'failed', error: failure })
      expect(lifecycle.phase).toBe('stopped')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('observes an early rejected dev exit while provider cleanup is pending', async () => {
    vi.useFakeTimers()
    try {
      const lifecycle = new Lifecycle()
      const process = dev()
      process.exit = Promise.reject(new Error('Exit unavailable'))
      await lifecycle.setDev(process)
      await lifecycle.setProvider(provider(() => new Promise(() => {})))
      const stopped = lifecycle.stop()
      await vi.advanceTimersByTimeAsync(6000)
      expect((await stopped).error?.message).toMatch(/observe process exit/)
      expect(lifecycle.phase).toBe('stopped')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
