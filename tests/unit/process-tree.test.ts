import { ChildProcess, execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import {
  cancelJobOnAbort,
  ownPosixTree,
  ownWindowsTree,
} from '../../src/core/process-tree.js'

afterEach(() => vi.restoreAllMocks())

function child(): ChildProcess {
  const native = new ChildProcess()
  Object.defineProperty(native, 'pid', { value: 123 })
  return native
}

const root = { pid: 123, identity: '123:original', running: true }
const descendant = { pid: 124, identity: '124:original', running: true }

it('refuses a group whose initial snapshot contains only an unanchored descendant', async () => {
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const tree = ownPosixTree(child(), {
    snapshotSync: () => [descendant],
    snapshot: async () => [descendant],
  })
  try {
    await expect(
      tree.waitForStop(new AbortController().signal),
    ).rejects.toThrow(/root identity was unavailable/)
    expect(() => tree.kill('SIGKILL')).toThrow(/root identity/)
    expect(kill).not.toHaveBeenCalled()
  } finally {
    tree.dispose()
  }
})

it('keeps observed descendants after root exit but refuses a reused group', async () => {
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  let current = [root, descendant]
  const tree = ownPosixTree(child(), {
    snapshotSync: () => [root],
    snapshot: async () => current,
  })
  try {
    await delay(0)
    current = [descendant]
    tree.kill('SIGTERM')
    await delay(125)
    expect(kill).toHaveBeenCalledExactlyOnceWith(-123, 'SIGTERM')
    current = [{ ...root, identity: '123:reused' }]
    const stopped = tree.waitForStop(new AbortController().signal)
    const assertion = expect(stopped).rejects.toThrow(/possibly reused group/)
    tree.kill('SIGKILL')
    await assertion
    expect(kill).toHaveBeenCalledTimes(1)
    expect(() => tree.kill('SIGKILL')).toThrow(/possibly reused group/)
  } finally {
    tree.dispose()
  }
})

it('rejects Windows root-first cleanup before any safe initial identity', async () => {
  const native = child()
  let resolve!: (snapshot: string) => void
  const job = vi.fn(
    () =>
      new Promise<string>((yes) => {
        resolve = yes
      }),
  )
  const tree = ownWindowsTree(native, job)
  try {
    native.emit('exit', 7, null)
    resolve(JSON.stringify([{ pid: 123, parent: 1, born: '100' }]))
    await expect(
      tree.waitForStop(new AbortController().signal),
    ).rejects.toThrow(/before its creation identity/)
    expect(() => tree.kill('SIGKILL')).toThrow(/creation identity/)
    expect(job).toHaveBeenCalledOnce()
  } finally {
    tree.dispose()
    expect(native.listenerCount('exit')).toBe(0)
  }
})

it('terminates tracked Windows root-first resources and preserves ancestry uncertainty', async () => {
  const native = child()
  let current = [
    { pid: 123, parent: 1, born: '100' },
    { pid: 124, parent: 123, born: '200' },
  ]
  let terminationRequests = 0
  const job = async (script: string): Promise<string> => {
    if (script.includes('$rootKilled')) {
      terminationRequests++
      current = []
      return JSON.stringify({ rootKilled: false })
    }
    return JSON.stringify(current)
  }
  const tree = ownWindowsTree(native, job)
  try {
    await delay(0)
    native.emit('exit', 7, null)
    current = [{ pid: 124, parent: 123, born: '200' }]
    tree.kill('SIGTERM')
    tree.kill('SIGKILL')
    const stopped = tree.waitForStop(new AbortController().signal)
    const assertion = expect(stopped).rejects.toThrow(/unobserved ancestry/)
    await assertion
    expect(terminationRequests).toBe(1)
  } finally {
    tree.dispose()
    expect(native.listenerCount('exit')).toBe(0)
  }
})

it.each(['posix', 'windows-before-initialization'] as const)(
  'aborts a real in-flight inspector during abrupt %s owner exit',
  async (platform) => {
    const before = new Set(process.listeners('exit'))
    let inspector: ChildProcess | undefined
    let jobs = 0
    let ready!: () => void
    const started = new Promise<void>((resolve) => {
      ready = resolve
    })
    let exited!: () => void
    const closed = new Promise<void>((resolve) => {
      exited = resolve
    })
    const job = (signal: AbortSignal): Promise<string> =>
      new Promise((resolve, reject) => {
        jobs += 1
        inspector = execFile(
          process.execPath,
          [
            '-e',
            'process.on("SIGTERM", () => {}); console.log("inspector-ready"); setInterval(() => {}, 1000)',
          ],
          {
            killSignal: 'SIGKILL',
            timeout: 60_000,
          },
          (error, stdout) => (error ? reject(error) : resolve(stdout)),
        )
        cancelJobOnAbort(inspector, signal)
        inspector.stdout?.once('data', ready)
        inspector.once('close', exited)
      })
    const tree =
      platform === 'posix'
        ? ownPosixTree(child(), {
            snapshotSync: (() => {
              let initial = true
              return () => {
                if (initial) {
                  initial = false
                  return [root]
                }
                return []
              }
            })(),
            snapshot: (_group, signal) => job(signal).then(() => []),
          })
        : ownWindowsTree(child(), (_script, signal) => job(signal))
    try {
      await started
      if (!inspector) throw new Error('Inspector did not spawn')
      const kill = vi.spyOn(inspector, 'kill')
      const handler = process
        .listeners('exit')
        .find((listener) => !before.has(listener))
      if (!handler) throw new Error('Missing owned abrupt exit handler')
      // Invoke only this adapter's exit callback, without exiting the test worker.
      handler.call(process, 23)
      expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
      await closed
      if (process.platform !== 'win32')
        expect(inspector.signalCode).toBe('SIGKILL')
      await delay(125)
      expect(jobs).toBe(1)
    } finally {
      tree.dispose()
      inspector?.kill('SIGKILL')
      await closed
    }
  },
)
