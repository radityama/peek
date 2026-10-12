import { describe, expect, it } from 'vitest'
import { docsNav, findDoc } from '../../src/content/docs'

describe('docs manifest', () => {
  it('exposes unique hrefs under /docs', () => {
    const hrefs = docsNav.map((entry) => entry.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.every((href) => href.startsWith('/docs'))).toBe(true)
  })

  it('imports non-empty source for every entry', () => {
    for (const entry of docsNav) {
      expect(entry.source.trim().length).toBeGreaterThan(0)
    }
  })

  it('finds an entry by slug', () => {
    expect(findDoc('cli')?.title).toBe('CLI reference')
    expect(findDoc('missing')).toBeUndefined()
  })
})
