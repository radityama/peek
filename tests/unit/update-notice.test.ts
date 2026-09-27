import { expect, it, vi } from 'vitest'
import { TerminalOutput } from '../../src/ui/output.js'
import { shouldCheckForUpdates } from '../../src/update/eligibility.js'
import { createUpdateNotice } from '../../src/update/notice.js'

const update = { current: '0.2.0', latest: '0.2.1' }

it('waits for preview readiness when the check finishes first', () => {
  const show = vi.fn()
  const notice = createUpdateNotice(show)
  notice.receive(update)
  expect(show).not.toHaveBeenCalled()
  notice.ready()
  notice.ready()
  expect(show).toHaveBeenCalledOnce()
  expect(show).toHaveBeenCalledWith(update)
})

it('shows an update arriving after readiness only once', () => {
  const show = vi.fn()
  const notice = createUpdateNotice(show)
  notice.ready()
  notice.receive(update)
  notice.receive(update)
  expect(show).toHaveBeenCalledOnce()
})

it('does not show an update after shutdown', () => {
  const show = vi.fn()
  const notice = createUpdateNotice(show)
  notice.ready()
  notice.stop()
  notice.receive(update)
  expect(show).not.toHaveBeenCalled()
})

it.each([
  { isDoctor: true, json: false, env: {} },
  { isDoctor: false, json: true, env: {} },
  { isDoctor: false, json: false, env: { CI: 'true' } },
  { isDoctor: false, json: false, env: { NODE_ENV: 'test' } },
  { isDoctor: false, json: false, env: { NO_UPDATE_NOTIFIER: '1' } },
])('skips checking for disabled modes: %j', (options) => {
  expect(shouldCheckForUpdates(options)).toBe(false)
})

it('checks an interactive preview by default', () => {
  expect(shouldCheckForUpdates({ isDoctor: false, json: false, env: {} })).toBe(
    true,
  )
})

it('prints the scoped package update command in terminal mode', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  try {
    new TerminalOutput('off').updateAvailable('0.2.0', '0.2.1')
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Update available 0.2.0 → 0.2.1'),
    )
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('npm install --global @radityprtama/peek@latest'),
    )
  } finally {
    write.mockRestore()
  }
})
