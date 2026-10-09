import { execFile } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inspectChildListeners } from '../../src/core/server.js'

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: vi.fn(),
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
if (!platform) throw new Error('Missing process platform descriptor')

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  vi.mocked(execFile).mockReset()
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  vi.restoreAllMocks()
})

it('keeps descendant listener evidence when the Windows netstat reader fails', async () => {
  // Mirrors the promisified execFile contract: success resolves { stdout }.
  vi.mocked(execFile).mockImplementation(((
    file: string,
    _args: readonly string[],
    _options: unknown,
    callback: (error: Error | null, stdout: unknown, stderr: string) => void,
  ) => {
    if (file === 'netstat')
      callback(
        Object.assign(new Error('netstat timed out'), { killed: true }),
        '',
        '',
      )
    else callback(null, { stdout: '60367\n', stderr: '' }, '')
    return {}
  }) as never)

  // A failed direct reader is not evidence of no listener; the descendant scan
  // must still contribute ports so an announced ephemeral port is detected.
  await expect(inspectChildListeners(4321)).resolves.toEqual({
    available: false,
    ports: [60367],
  })
})
