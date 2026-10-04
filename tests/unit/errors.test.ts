import { expect, it } from 'vitest'
import { shouldRenderQr } from '../../src/ui/qr.js'
import {
  errorExitCode,
  formatError,
  PeekError,
  type PeekErrorCode,
} from '../../src/utils/errors.js'

const failureStatuses: Record<PeekErrorCode, 1 | 2> = {
  PROJECT_NOT_FOUND: 1,
  PROJECT_INVALID: 1,
  CONFIG_ERROR: 1,
  DEV_SCRIPT_NOT_FOUND: 1,
  PACKAGE_MANAGER_ERROR: 1,
  SERVER_START_ERROR: 1,
  SERVER_DETECTION_ERROR: 1,
  SERVER_TIMEOUT: 1,
  CLOUDFLARED_INSTALL_ERROR: 1,
  TUNNEL_CONNECTION_ERROR: 1,
  TUNNEL_CONFIG_ERROR: 1,
  PROCESS_CLEANUP_ERROR: 1,
  USAGE_ERROR: 2,
}

it.each(Object.entries(failureStatuses))(
  'keeps %s at failure status %d',
  (code, status) => {
    const error = new PeekError(code as PeekErrorCode, 'Failure.', 'Retry.')
    expect(errorExitCode(error)).toBe(status)
  },
)

it.each([new Error('unknown detail'), 'unknown detail', null, {}])(
  'keeps unknown failures at status 1 (%j)',
  (error) => expect(errorExitCode(error)).toBe(1),
)

it('formats expected and unexpected details without reading stacks', () => {
  const cause = new Error('private cause')
  Object.defineProperty(cause, 'stack', {
    get() {
      throw new Error('stack was read')
    },
  })
  const expected = new PeekError(
    'CONFIG_ERROR',
    'Config failed.',
    'Fix config.',
    cause,
  )
  expect(formatError(expected)).toBe('Config failed.\n\nFix config.')
  expect(formatError(expected, true)).toContain('Details: private cause')
  expect(formatError(cause)).not.toContain('private cause')
  expect(formatError(cause, true)).toContain('Details: private cause')
})

it('formats expected errors with an actionable hint and no stack', () => {
  const error = new PeekError(
    'DEV_SCRIPT_NOT_FOUND',
    'No dev script was found.',
    'Add scripts.dev to package.json.',
    new Error('internal detail'),
  )
  expect(formatError(error)).toBe(
    'No dev script was found.\n\nAdd scripts.dev to package.json.',
  )
  expect(formatError(error)).not.toContain('internal detail')
  expect(formatError(error, true)).toContain('Details: internal detail')
})

it('renders QR only when the terminal is interactive and large enough', () => {
  expect(shouldRenderQr('auto', true, 80, 30, 40, 20)).toBe(true)
  expect(shouldRenderQr('on', false, 80, 30, 40, 20)).toBe(false)
  expect(shouldRenderQr('on', true, 20, 30, 40, 20)).toBe(false)
  expect(shouldRenderQr('off', true, 80, 30, 40, 20)).toBe(false)
})
