import { describe, expect, it } from 'vitest'
import { cn } from '../../src/lib/cn'

describe('cn', () => {
  it('joins truthy class names with single spaces', () => {
    expect(cn('a', false, 'b', undefined, null, 'c')).toBe('a b c')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, undefined, null)).toBe('')
  })
})
