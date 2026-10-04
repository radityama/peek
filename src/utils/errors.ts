export type PeekErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_INVALID'
  | 'CONFIG_ERROR'
  | 'DEV_SCRIPT_NOT_FOUND'
  | 'PACKAGE_MANAGER_ERROR'
  | 'SERVER_START_ERROR'
  | 'SERVER_DETECTION_ERROR'
  | 'SERVER_TIMEOUT'
  | 'CLOUDFLARED_INSTALL_ERROR'
  | 'TUNNEL_CONNECTION_ERROR'
  | 'TUNNEL_CONFIG_ERROR'
  | 'PROCESS_CLEANUP_ERROR'
  | 'USAGE_ERROR'

export class PeekError extends Error {
  readonly code: PeekErrorCode
  readonly hint: string

  constructor(
    code: PeekErrorCode,
    message: string,
    hint: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'PeekError'
    this.code = code
    this.hint = hint
  }
}

export function errorExitCode(error: unknown): 1 | 2 {
  return error instanceof PeekError && error.code === 'USAGE_ERROR' ? 2 : 1
}

export function formatError(error: unknown, verbose = false): string {
  if (error instanceof PeekError) {
    const lines = [`${error.message}`, '', error.hint]
    if (verbose && error.cause !== undefined) {
      lines.push('', `Details: ${formatCause(error.cause)}`)
    }
    return lines.join('\n')
  }

  const message = error instanceof Error ? error.message : String(error)
  return verbose
    ? `Peek failed unexpectedly.\n\nDetails: ${message}`
    : 'Peek failed unexpectedly. Run peek --verbose for details.'
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
