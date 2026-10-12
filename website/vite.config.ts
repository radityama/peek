import { readFileSync } from 'node:fs'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// The `.ts` extension keeps Vite's upcoming native config loader happy.
import { buildRobotsTxt, buildSitemapXml } from './src/lib/sitemap.ts'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

const siteUrl = process.env.VITE_SITE_URL ?? 'http://localhost:3001'

/** `vite build --mode cloudflare` is the Worker build; plain `build` is the static site. */
const CLOUDFLARE_MODE = 'cloudflare'

/**
 * Emits sitemap.xml and robots.txt as build assets so the absolute URLs always
 * match the deployed origin instead of drifting in a hand-written static file.
 */
function seoAssets(): import('vite').Plugin {
  const files: Record<string, string> = {
    'sitemap.xml': buildSitemapXml(siteUrl),
    'robots.txt': buildRobotsTxt(siteUrl),
  }
  return {
    name: 'peek-seo-assets',
    apply: 'build',
    generateBundle() {
      // Runs once per environment; the Worker service does not need these.
      if (this.environment.config.consumer !== 'client') return
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  server: { port: 3001, fs: { allow: ['..'] } },
  define: { __PEEK_VERSION__: JSON.stringify(rootPackage.version) },
  plugins: [
    // The Cloudflare plugin must come first and own the SSR environment. It
    // also moves prerendering into `workerd`, so the deployable Worker is a
    // separate target from the static site: `vite build` emits `dist/client`,
    // and `vite build --mode cloudflare` emits the Worker that `wrangler
    // deploy` uploads.
    ...(mode === CLOUDFLARE_MODE
      ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
      : []),
    tailwindcss(),
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    // React's Vite plugin must come after the Start plugin.
    viteReact(),
    seoAssets(),
  ],
}))
