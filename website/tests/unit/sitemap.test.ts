import { describe, expect, it } from 'vitest'
import {
  buildRobotsTxt,
  buildSitemapXml,
  sitemapPaths,
} from '../../src/lib/sitemap'

describe('sitemap', () => {
  it('lists every public page once', () => {
    expect(new Set(sitemapPaths).size).toBe(sitemapPaths.length)
    expect(sitemapPaths).toContain('/')
    expect(sitemapPaths).not.toContain('/404')
  })

  it('builds absolute URLs from the site URL', () => {
    const xml = buildSitemapXml('https://peek.example')
    for (const path of sitemapPaths) {
      const expected =
        path === '/' ? 'https://peek.example' : `https://peek.example${path}`
      expect(xml).toContain(`<loc>${expected}</loc>`)
    }
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).toContain('<urlset')
  })

  it('ignores a trailing slash on the site URL', () => {
    expect(buildSitemapXml('https://peek.example/')).toBe(
      buildSitemapXml('https://peek.example'),
    )
    expect(buildRobotsTxt('https://peek.example/')).toContain(
      'Sitemap: https://peek.example/sitemap.xml',
    )
  })

  it('points robots.txt at the sitemap', () => {
    expect(buildRobotsTxt('https://peek.example')).toContain(
      'Sitemap: https://peek.example/sitemap.xml',
    )
  })
})
