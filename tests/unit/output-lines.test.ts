import { expect, it } from 'vitest'
import {
  consumeOutputLines,
  MAX_BUFFERED_LINE,
} from '../../src/utils/output-lines.js'

it('returns complete lines and keeps the unterminated tail', () => {
  const result = consumeOutputLines('', 'one\ntwo\r\nthree')
  expect(result.lines).toEqual(['one', 'two'])
  expect(result.pending).toBe('three')
})

it('joins a line split across chunks', () => {
  const first = consumeOutputLines('', 'Local: http://local')
  expect(first.lines).toEqual([])
  const second = consumeOutputLines(first.pending, 'host:5173\n')
  expect(second.lines).toEqual(['Local: http://localhost:5173'])
  expect(second.pending).toBe('')
})

it('bounds an unterminated line to the retained tail', () => {
  const result = consumeOutputLines('', 'x'.repeat(MAX_BUFFERED_LINE * 3))
  expect(result.pending.length).toBe(MAX_BUFFERED_LINE)
  expect(result.pending).toBe('x'.repeat(MAX_BUFFERED_LINE))
})

it('reports complete lines even when the chunk also carries a huge tail', () => {
  const result = consumeOutputLines(
    '',
    `done\n${'y'.repeat(MAX_BUFFERED_LINE * 2)}`,
  )
  expect(result.lines).toEqual(['done'])
  expect(result.pending.length).toBe(MAX_BUFFERED_LINE)
})
