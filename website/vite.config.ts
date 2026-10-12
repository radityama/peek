import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  server: { port: 3001 },
  define: { __PEEK_VERSION__: JSON.stringify(rootPackage.version) },
  plugins: [
    tailwindcss(),
    // crawlLinks stays off in Plan 1; enable it in Plan 3 once every linked
    // route (including /docs/cli and /docs/troubleshooting) exists.
    tanstackStart({ prerender: { enabled: true, crawlLinks: false } }),
    // React's Vite plugin must come after the Start plugin.
    viteReact(),
  ],
})
