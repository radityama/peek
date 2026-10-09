import { expect } from 'vitest'

const stringFields: Record<string, readonly string[]> = {
  start: [],
  info: ['message'],
  state: ['state', 'message'],
  warning: ['kind', 'message'],
  success: ['message'],
  diagnostic: ['message'],
  'child-output': ['stream', 'content'],
  ready: ['localUrl', 'publicUrl'],
  'lan-ready': ['url'],
  error: ['message'],
  'doctor-check': ['name', 'status', 'message'],
  help: ['text'],
  version: ['version'],
}

export function readJsonEvents(stdout: string): Record<string, unknown>[] {
  expect(stdout.length).toBeGreaterThan(0)
  expect(stdout.endsWith('\n')).toBe(true)
  return stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parsed: unknown = JSON.parse(line)
      expect(parsed).not.toBeNull()
      expect(typeof parsed).toBe('object')
      expect(Array.isArray(parsed)).toBe(false)
      const event = parsed as Record<string, unknown>
      expect(event.schemaVersion).toBe(1)
      if (typeof event.type !== 'string')
        throw new Error('Missing string event type')
      const fields = stringFields[event.type]
      if (!fields) throw new Error(`Unknown current event type: ${event.type}`)
      for (const field of fields) expect(typeof event[field]).toBe('string')
      if (event.type === 'help' || event.type === 'version') {
        expect(Object.hasOwn(event, 'timestamp')).toBe(false)
      } else {
        expect(typeof event.timestamp).toBe('string')
        const timestamp = String(event.timestamp)
        expect(timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        )
        expect(Number.isFinite(Date.parse(timestamp))).toBe(true)
        expect(new Date(timestamp).toISOString()).toBe(timestamp)
      }
      if (event.type === 'child-output')
        expect(['stdout', 'stderr']).toContain(event.stream)
      if (event.type === 'doctor-check') {
        expect(['pass', 'warn', 'fail']).toContain(event.status)
        for (const field of ['remedy', 'detail']) {
          if (Object.hasOwn(event, field))
            expect(typeof event[field]).toBe('string')
        }
      }
      for (const field of ['url', 'localUrl', 'publicUrl']) {
        if (Object.hasOwn(event, field)) {
          const url = new URL(String(event[field]))
          expect(['http:', 'https:']).toContain(url.protocol)
        }
      }
      return event
    })
}

const devCleanupUncertainty =
  'Dev server cleanup failed to confirm resource shutdown.'

// A dev root that exits before its creation identity is observed yields a
// second conservative cleanup error. Callers assert the primary failure and
// allow only this signal as the extra error.
export function isDevCleanupUncertainty(event: {
  type?: unknown
  message?: unknown
}): boolean {
  return (
    event.type === 'error' &&
    typeof event.message === 'string' &&
    event.message.includes(devCleanupUncertainty)
  )
}
