/**
 * Every public page, in crawl order. Deliberately explicit rather than derived
 * from the generated route tree: this list is the set of pages we want indexed,
 * and the build asserts it matches what prerender actually emitted.
 */
export const sitemapPaths = [
  '/',
  '/features',
  '/docs',
  '/docs/cli',
  '/docs/troubleshooting',
  '/changelog',
  '/security',
] as const

function toUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return path === '/' ? base : `${base}${path}`
}

export function buildSitemapXml(baseUrl: string): string {
  const urls = sitemapPaths
    .map((path) => `  <url><loc>${toUrl(baseUrl, path)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobotsTxt(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
}
