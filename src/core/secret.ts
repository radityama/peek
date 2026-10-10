import { PeekError } from '../utils/errors.js'

interface SecretInput {
  isTTY?: boolean
  isRaw?: boolean
  setRawMode?: (raw: boolean) => void
  resume(): void
  pause(): void
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  once(event: 'end', listener: () => void): unknown
  off(event: 'data', listener: (chunk: Buffer) => void): unknown
  off(event: 'end', listener: () => void): unknown
}

interface SecretOutput {
  isTTY?: boolean
  write(value: string): unknown
}

const maxPasswordBytes = 1_024
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export async function readPassword(
  signal: AbortSignal,
  input: SecretInput = process.stdin,
  output: SecretOutput = process.stderr,
): Promise<string> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new PeekError(
      'USAGE_ERROR',
      '--password needs an interactive terminal.',
      'Run Peek in a terminal so it can read the password without echoing it.',
    )
  }
  output.write('Preview password: ')
  const previousRaw = input.isRaw
  const bytes: number[] = []
  let value: string
  try {
    input.setRawMode(true)
    input.resume()
    value = await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        for (const byte of chunk) {
          if (byte === 3) {
            cleanup()
            process.emit('SIGINT')
            reject(signal.reason)
            return
          }
          if (byte === 13 || byte === 10) {
            cleanup()
            try {
              resolve(utf8.decode(Buffer.from(bytes)))
            } catch {
              reject(
                new PeekError(
                  'USAGE_ERROR',
                  'Password input is not valid UTF-8.',
                  'Enter a valid Unicode password and retry.',
                ),
              )
            }
            return
          }
          if (byte === 4) {
            cleanup()
            reject(
              new PeekError(
                'USAGE_ERROR',
                'Password input ended.',
                'Restart Peek in an interactive terminal.',
              ),
            )
            return
          }
          if (byte === 127 || byte === 8) {
            while (bytes.length > 0 && ((bytes.at(-1) ?? 0) & 0xc0) === 0x80)
              bytes.pop()
            bytes.pop()
            continue
          }
          if (byte >= 32) {
            if (bytes.length >= maxPasswordBytes) {
              cleanup()
              reject(
                new PeekError(
                  'USAGE_ERROR',
                  'Preview password is too long.',
                  'Use a password of at most 1024 UTF-8 bytes.',
                ),
              )
              return
            }
            bytes.push(byte)
          }
        }
      }
      const onEnd = (): void => {
        cleanup()
        reject(
          new PeekError(
            'USAGE_ERROR',
            'Password input ended.',
            'Restart Peek in an interactive terminal.',
          ),
        )
      }
      const cleanup = (): void => {
        input.off('data', onData)
        input.off('end', onEnd)
        signal.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        cleanup()
        reject(signal.reason)
      }
      input.on('data', onData)
      input.once('end', onEnd)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  } finally {
    input.setRawMode(previousRaw ?? false)
    input.pause()
    output.write('\n')
  }
  if (value.length === 0) {
    throw new PeekError(
      'USAGE_ERROR',
      'Preview password cannot be empty.',
      'Run Peek again and enter a nonempty password.',
    )
  }
  return value
}
