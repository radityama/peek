// Fails the build when the emitted sitemap and the prerendered pages disagree,
// so adding or renaming a route cannot silently leave it out of the sitemap
// (or advertise a page that was never generated).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url))

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return htmlFiles(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}

const pagePaths = [
  ...new Set(
    htmlFiles(clientDir).map((file) => {
      const rel = relative(clientDir, file).split(sep).join('/')
      const withoutIndex = rel.replace(/index\.html$/, '')
      if (withoutIndex === '') return '/'
      return `/${withoutIndex.replace(/\/$/, '')}`
    }),
  ),
].sort()

const sitemap = readFileSync(join(clientDir, 'sitemap.xml'), 'utf8')
const sitemapPaths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]
  .map((match) => match[1].replace(/^https?:\/\/[^/]+/, '') || '/')
  .sort()

if (JSON.stringify(pagePaths) !== JSON.stringify(sitemapPaths)) {
  console.error('sitemap.xml and the prerendered pages disagree')
  console.error(`  pages:   ${pagePaths.join(' ')}`)
  console.error(`  sitemap: ${sitemapPaths.join(' ')}`)
  process.exit(1)
}

console.log(`sitemap matches the ${pagePaths.length} prerendered pages`)
