import { afterEach, expect, it, vi } from 'vitest'
import { type JsonEventInput, writeJsonEvent } from '../../src/ui/json-event.js'
import { JsonOutput } from '../../src/ui/json-output.js'
import { readJsonEvents } from '../helpers/json-contract.js'

afterEach(() => vi.restoreAllMocks())

function capture(): () => string {
  let stdout = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk)
    return true
  })
  return () => stdout
}

const renderer = new JsonOutput()
const cases: {
  name: string
  emit: () => void
  payload: Record<string, unknown>
}[] = [
  { name: 'start', emit: () => renderer.title(), payload: { type: 'start' } },
  {
    name: 'info',
    emit: () => renderer.info('info'),
    payload: { type: 'info', message: 'info' },
  },
  {
    name: 'state',
    emit: () => renderer.state('starting', 'starting'),
    payload: { type: 'state', state: 'starting', message: 'starting' },
  },
  {
    name: 'warning',
    emit: () => renderer.warning('tunnel-dropped', 'dropped'),
    payload: { type: 'warning', kind: 'tunnel-dropped', message: 'dropped' },
  },
  {
    name: 'success',
    emit: () => renderer.success('success'),
    payload: { type: 'success', message: 'success' },
  },
  {
    name: 'diagnostic',
    emit: () => renderer.diagnostic('diagnostic'),
    payload: { type: 'diagnostic', message: 'diagnostic' },
  },
  {
    name: 'child-output',
    emit: () => renderer.childOutput('stdout', 'stdout\n'),
    payload: { type: 'child-output', stream: 'stdout', content: 'stdout\n' },
  },
  {
    name: 'ready',
    emit: () =>
      renderer.ready('http://localhost:3000', 'https://test.trycloudflare.com'),
    payload: {
      type: 'ready',
      localUrl: 'http://localhost:3000',
      publicUrl: 'https://test.trycloudflare.com',
    },
  },
  {
    name: 'lan-ready',
    emit: () => renderer.lanReady('http://192.168.1.2:3000'),
    payload: { type: 'lan-ready', url: 'http://192.168.1.2:3000' },
  },
  {
    name: 'error',
    emit: () => renderer.error('failed\nFix the command.'),
    payload: { type: 'error', message: 'failed\nFix the command.' },
  },
  {
    name: 'doctor-check',
    emit: () =>
      renderer.doctorCheck({
        name: 'node',
        status: 'pass',
        message: 'Node available',
      }),
    payload: {
      type: 'doctor-check',
      name: 'node',
      status: 'pass',
      message: 'Node available',
    },
  },
  {
    name: 'help',
    emit: () => writeJsonEvent({ type: 'help', text: 'peek --help\n' }),
    payload: { type: 'help', text: 'peek --help\n' },
  },
  {
    name: 'version',
    emit: () => writeJsonEvent({ type: 'version', version: '0.2.2' }),
    payload: { type: 'version', version: '0.2.2' },
  },
]

it.each(cases)('preserves the $name wire shape', ({ emit, payload }) => {
  const stdout = capture()
  const stderr = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true)
  emit()
  const events = readJsonEvents(stdout())
  const staticEvent = payload.type === 'help' || payload.type === 'version'
  expect(events).toStrictEqual([
    {
      schemaVersion: 1,
      ...payload,
      ...(staticEvent ? {} : { timestamp: expect.any(String) }),
    },
  ])
  expect(stderr).not.toHaveBeenCalled()
})

it.each(['stdout', 'stderr'] as const)(
  'preserves escaped %s chunks',
  (stream) => {
    const stdout = capture()
    const content = 'quotes "hi"\\path\nsecond line\r\n日本語 🚀'
    renderer.childOutput(stream, content)
    expect(readJsonEvents(stdout())[0]).toMatchObject({
      type: 'child-output',
      stream,
      content,
    })
    expect(stdout().split('\n')).toHaveLength(2)
  },
)

it.each(['pass', 'warn', 'fail'] as const)(
  'serializes doctor status %s and optional strings',
  (status) => {
    const stdout = capture()
    renderer.doctorCheck({
      name: 'check',
      status,
      message: 'message',
      remedy: 'remedy',
      detail: 'detail',
    })
    expect(readJsonEvents(stdout())[0]).toStrictEqual({
      schemaVersion: 1,
      type: 'doctor-check',
      timestamp: expect.any(String),
      name: 'check',
      status,
      message: 'message',
      remedy: 'remedy',
      detail: 'detail',
    })
  },
)

it('owns reserved metadata even for a structurally widened input', () => {
  const stdout = capture()
  writeJsonEvent({
    type: 'help',
    text: 'help',
    schemaVersion: 99,
    timestamp: 'wrong',
  } as unknown as JsonEventInput)
  expect(readJsonEvents(stdout())).toStrictEqual([
    { schemaVersion: 1, type: 'help', text: 'help' },
  ])
})

it('rejects every missing required field in the current records', () => {
  const stdout = capture()
  for (const sample of cases) sample.emit()
  const events = readJsonEvents(stdout())
  for (const event of events) {
    for (const key of Object.keys(event)) {
      const missing = { ...event }
      delete missing[key]
      expect(() => readJsonEvents(`${JSON.stringify(missing)}\n`)).toThrow()
    }
  }
})

it.each([
  'human output\n',
  '{broken\n',
  'null\n',
  '{"schemaVersion":1,"type":"version","version":42}\n',
  '{"schemaVersion":1,"type":"version","version":"0.2.2"}',
  '{"schemaVersion":1,"type":"start","timestamp":"invalid"}\n',
  '{"schemaVersion":1,"type":"child-output","timestamp":"2026-10-03T00:00:00.000Z","stream":"other","content":"x"}\n',
  '{"schemaVersion":1,"type":"doctor-check","timestamp":"2026-10-03T00:00:00.000Z","name":"x","status":"other","message":"x"}\n',
])('rejects malformed contract input %s', (stdout) => {
  expect(() => readJsonEvents(stdout)).toThrow()
})
