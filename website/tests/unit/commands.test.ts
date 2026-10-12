import { describe, expect, it } from 'vitest'
import { composePeekCommand } from '../../src/content/commands'

describe('composePeekCommand', () => {
  it('returns the bare command when nothing is selected', () => {
    expect(composePeekCommand({})).toBe('peek')
  })

  it('adds password and expiry in order', () => {
    expect(composePeekCommand({ password: true, expires: '30m' })).toBe(
      'peek --password --expires 30m',
    )
  })

  it('adds lan', () => {
    expect(composePeekCommand({ lan: true })).toBe('peek --lan')
  })

  it('adds private', () => {
    expect(composePeekCommand({ private: true })).toBe('peek --private')
  })
})
