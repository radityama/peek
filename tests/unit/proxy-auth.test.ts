import { expect, it } from 'vitest'
import {
  createAuthGate,
  validWebSocketOrigin,
} from '../../src/core/proxy-auth.js'

function basic(credential: string): string {
  return `Basic ${Buffer.from(credential).toString('base64')}`
}

it('accepts a canonical Unicode Basic credential and a case-insensitive scheme', () => {
  const check = createAuthGate('pässword')
  expect(check(basic('peek:pässword'))).toBe(200)
  expect(check(basic('peek:pässword').replace('Basic', 'basic'))).toBe(200)
})

it.each([
  'Bearer token',
  'Basic ',
  `${basic('peek:secret')}=`,
  basic('other:secret'),
  basic('peek:wrong'),
  `Basic ${Buffer.from([112, 101, 101, 107, 58, 0xc3, 0x28]).toString('base64')}`,
])(
  'rejects malformed or incorrect credentials without forwarding',
  (header) => {
    expect(createAuthGate('secret')(header)).toBe(401)
  },
)

it('bounds gateway-wide failed guesses and lets valid credentials recover immediately', () => {
  let now = 0
  const check = createAuthGate('secret', () => now)
  for (let index = 0; index < 12; index++) expect(check(undefined)).toBe(401)
  expect(check(basic('peek:wrong'))).toBe(429)
  expect(check(basic('peek:secret'))).toBe(200)
  now = 5_000
  expect(check(undefined)).toBe(401)
  expect(check(undefined)).toBe(429)
})

it('accepts only the active public origin for browser WebSocket upgrades', () => {
  const active = 'https://preview.trycloudflare.com'
  expect(validWebSocketOrigin(active, active)).toBe(true)
  expect(validWebSocketOrigin(undefined, active)).toBe(true)
  expect(validWebSocketOrigin(active, undefined)).toBe(false)
  for (const header of [
    'https://attacker.example',
    'http://preview.trycloudflare.com',
    'null',
    'https://preview.trycloudflare.com/path',
    'https://user@preview.trycloudflare.com',
    'https://preview.trycloudflare.com, https://attacker.example',
  ]) {
    expect(validWebSocketOrigin(header, active)).toBe(false)
  }
})
