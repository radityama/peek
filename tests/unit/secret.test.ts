import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { readPassword } from '../../src/core/secret.js'

function terminal(): {
  input: NonNullable<Parameters<typeof readPassword>[1]>
  output: NonNullable<Parameters<typeof readPassword>[2]>
  written: () => string
  raw: ReturnType<typeof vi.fn>
} {
  const input = new PassThrough()
  const output = new PassThrough()
  const chunks: Buffer[] = []
  output.on('data', (chunk: Buffer) => chunks.push(chunk))
  const raw = vi.fn()
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: raw })
  Object.assign(output, { isTTY: true })
  return {
    input: input as unknown as NonNullable<Parameters<typeof readPassword>[1]>,
    output: output as unknown as NonNullable<
      Parameters<typeof readPassword>[2]
    >,
    written: () => Buffer.concat(chunks).toString('utf8'),
    raw,
  }
}

it('reads Unicode without echo and restores terminal mode', async () => {
  const tty = terminal()
  const result = readPassword(
    new AbortController().signal,
    tty.input,
    tty.output,
  )
  const input = tty.input as PassThrough
  input.write(Buffer.from('pásswörd'))
  input.write(Buffer.from([127]))
  input.write(Buffer.from('d\r'))
  expect(await result).toBe('pásswörd')
  expect(tty.written()).toBe('Preview password: \n')
  expect(tty.raw.mock.calls).toEqual([[true], [false]])
})

it('restores terminal mode when interrupted', async () => {
  const tty = terminal()
  const controller = new AbortController()
  const result = readPassword(controller.signal, tty.input, tty.output)
  controller.abort(new Error('stopped'))
  await expect(result).rejects.toThrow('stopped')
  expect(tty.raw.mock.calls).toEqual([[true], [false]])
})
