import { describe, expect, it } from 'vitest'
import { absoluteUrl, site } from '../../src/content/site'

describe('site config', () => {
  it('uses the canonical install command', () => {
    expect(site.install.pnpm).toBe('pnpm add -g @usepeek/peek')
    expect(site.install.npm).toBe('npm install -g @usepeek/peek')
  })

  it('has a non-empty label for every footer link', () => {
    const labels = site.footer.flatMap((group) =>
      group.links.map((link) => link.label),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
  })

  it('builds absolute URLs without duplicating the trailing slash', () => {
    expect(absoluteUrl('/features')).toBe(`${site.website}/features`)
    expect(absoluteUrl('/')).toBe(site.website)
  })
})
