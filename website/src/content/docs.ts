import cliSource from '../../../docs/CLI.md?raw'
import troubleshootingSource from '../../../docs/TROUBLESHOOTING.md?raw'

export interface DocEntry {
  readonly slug: string
  readonly href: string
  readonly title: string
  readonly description: string
  readonly source: string
}

export const docsNav: readonly DocEntry[] = [
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

export function findDoc(slug: string): DocEntry | undefined {
  return docsNav.find((entry) => entry.slug === slug)
}
