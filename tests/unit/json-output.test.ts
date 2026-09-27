import { afterEach, expect, it, vi } from 'vitest'
import { JsonOutput } from '../../src/ui/json-output.js'

afterEach(() => vi.restoreAllMocks())

it('emits one valid JSON event per line including child output', () => {
  let output = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += String(chunk)
    return true
  })
  const renderer = new JsonOutput()
  renderer.title()
  renderer.childOutput('stderr', 'server failed\n')
  renderer.ready('http://localhost:3000', 'https://test.trycloudflare.com')
  const events = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(events).toHaveLength(3)
  expect(events.map((event) => event.type)).toEqual([
    'start',
    'child-output',
    'ready',
  ])
  expect(events[1]).toMatchObject({
    schemaVersion: 1,
    stream: 'stderr',
    content: 'server failed\n',
  })
})
