import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { processState } from '../helpers/cli.js'

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
if (!platform) throw new Error('Missing process platform descriptor')
const absent = Object.assign(new Error('No such process'), { code: 'ESRCH' })
const psFailure = Object.assign(new Error('ps failed'), {
  status: 1,
  stdout: '',
  stderr: '',
})

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  vi.spyOn(process, 'kill').mockReturnValue(true)
  vi.mocked(execFileSync).mockReset()
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  vi.restoreAllMocks()
})

it('confirms disappearance after macOS ps exits one with no output', () => {
  vi.mocked(process.kill)
    .mockReturnValueOnce(true)
    .mockImplementationOnce(() => {
      throw absent
    })
  vi.mocked(execFileSync).mockImplementation(() => {
    throw psFailure
  })
  expect(processState(123)).toBe('absent')
  expect(process.kill).toHaveBeenCalledTimes(2)
})

it('preserves macOS ps errors while the process still exists', () => {
  vi.mocked(execFileSync).mockImplementation(() => {
    throw psFailure
  })
  expect(() => processState(123)).toThrow(psFailure)
})

it.each([
  { status: 2, stdout: '', stderr: '' },
  { status: 1, stdout: '', stderr: 'permission denied' },
  { status: 1, stdout: 'unexpected output', stderr: '' },
  { code: 'ETIMEDOUT' },
  { code: 'ENOENT' },
  { code: 'ESRCH' },
])('preserves other macOS inspector errors: %j', (details) => {
  const failure = Object.assign(new Error('inspector failed'), details)
  vi.mocked(execFileSync).mockImplementation(() => {
    throw failure
  })
  expect(() => processState(123)).toThrow(failure)
  expect(process.kill).toHaveBeenCalledTimes(1)
})

it('preserves a failed second existence check other than ESRCH', () => {
  const permission = Object.assign(new Error('permission denied'), {
    code: 'EPERM',
  })
  vi.mocked(process.kill)
    .mockReturnValueOnce(true)
    .mockImplementationOnce(() => {
      throw permission
    })
  vi.mocked(execFileSync).mockImplementation(() => {
    throw psFailure
  })
  expect(() => processState(123)).toThrow(permission)
})
