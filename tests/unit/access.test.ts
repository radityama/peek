import { expect, it } from 'vitest'
import { parseExpiry, selectAccessMode } from '../../src/core/access.js'

it.each([
  ['1s', 1000],
  ['30m', 1_800_000],
  ['2h', 7_200_000],
  ['24h', 86_400_000],
] as const)('parses %s into an expiry duration', (input, expected) => {
  expect(parseExpiry(input)).toBe(expected)
})

it.each(['0s', '-1m', '1d', '25h', '999999999h', '', '1.5h'])(
  'rejects invalid expiry %j',
  (input) => expect(() => parseExpiry(input)).toThrow(),
)

const empty = {
  public: undefined,
  private: undefined,
  password: undefined,
  lan: undefined,
}

it('keeps plain Peek public and selects explicit access modes', () => {
  expect(selectAccessMode(empty)).toBe('public')
  expect(selectAccessMode({ ...empty, public: true })).toBe('public')
  expect(selectAccessMode({ ...empty, password: true })).toBe('protected')
  expect(selectAccessMode({ ...empty, private: true })).toBe('private')
  expect(selectAccessMode({ ...empty, lan: true })).toBe('private')
})

it.each([
  { public: true, password: true },
  { public: true, private: true },
  { private: true, password: true },
  { private: true, lan: true },
  { lan: true, password: true },
])('rejects conflicting access flags', (flags) => {
  expect(() => selectAccessMode({ ...empty, ...flags })).toThrow()
})
