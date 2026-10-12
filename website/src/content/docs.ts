import cliSource from '../../../docs/CLI.md?raw'
import troubleshootingSource from '../../../docs/TROUBLESHOOTING.md?raw'

export interface DocEntry {
  readonly slug: string
  readonly href: string
  readonly title: string
  readonly description: string
  readonly source: string
}

/** Pages rendered from a repository Markdown file, keyed by slug. */
export const docsManifest: readonly DocEntry[] = [
  {
    slug: 'cli',
    href: '/docs/cli',
    title: 'CLI reference',
    description: 'Every flag, exit status, and diagnostic Peek prints.',
    source: cliSource,
  },
  {
    slug: 'troubleshooting',
    href: '/docs/troubleshooting',
    title: 'Troubleshooting',
    description: 'Why a preview is unreachable, and what to do about it.',
    source: troubleshootingSource,
  },
]

/**
 * Sidebar links for every documentation page. Wider than `docsManifest`: the
 * quick start is authored, and `/security` renders `docs/SECURITY.md` through
 * its own server function rather than this manifest.
 */
export const docsSidebar: readonly { href: string; title: string }[] = [
  { href: '/docs', title: 'Quick start' },
  ...docsManifest.map(({ href, title }) => ({ href, title })),
  { href: '/security', title: 'Security model' },
]

export function findDoc(slug: string): DocEntry | undefined {
  return docsManifest.find((entry) => entry.slug === slug)
}
