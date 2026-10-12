export interface LinkItem {
  readonly label: string
  readonly to: string
  readonly external?: boolean
}

export interface FooterGroup {
  readonly title: string
  readonly links: readonly LinkItem[]
}

export interface SiteConfig {
  readonly name: string
  readonly tagline: string
  readonly description: string
  readonly website: string
  readonly github: string
  readonly npm: string
  readonly install: { readonly pnpm: string; readonly npm: string }
  readonly nav: readonly LinkItem[]
  readonly footer: readonly FooterGroup[]
}

const website = (
  import.meta.env.VITE_SITE_URL ?? 'http://localhost:3001'
).replace(/\/$/, '')

export const site: SiteConfig = {
  name: 'Peek',
  tagline: 'Run your dev server. Share it instantly.',
  description:
    'Peek starts your development server, verifies its port, and opens a temporary HTTPS preview. No account, no config.',
  website,
  github: 'https://github.com/radityama/peek',
  npm: 'https://www.npmjs.com/package/@usepeek/peek',
  install: {
    pnpm: 'pnpm add -g @usepeek/peek',
    npm: 'npm install -g @usepeek/peek',
  },
  nav: [
    { label: 'Features', to: '/features' },
    { label: 'Docs', to: '/docs' },
    { label: 'Changelog', to: '/changelog' },
    { label: 'Security', to: '/security' },
  ],
  footer: [
    {
      title: 'Product',
      links: [
        { label: 'Features', to: '/features' },
        { label: 'Changelog', to: '/changelog' },
      ],
    },
    {
      title: 'Docs',
      links: [
        { label: 'Quick start', to: '/docs' },
        { label: 'CLI reference', to: '/docs/cli' },
        { label: 'Troubleshooting', to: '/docs/troubleshooting' },
      ],
    },
    {
      title: 'Security',
      links: [
        { label: 'Security model', to: '/security' },
        {
          label: 'Report a vulnerability',
          to: 'https://github.com/radityama/peek/security/advisories/new',
          external: true,
        },
      ],
    },
    {
      title: 'Project',
      links: [
        {
          label: 'GitHub',
          to: 'https://github.com/radityama/peek',
          external: true,
        },
        {
          label: 'Issues',
          to: 'https://github.com/radityama/peek/issues',
          external: true,
        },
        {
          label: 'MIT license',
          to: 'https://github.com/radityama/peek/blob/main/LICENSE',
          external: true,
        },
      ],
    },
  ],
}

export function absoluteUrl(path: string): string {
  if (path === '/') return website
  return `${website}${path}`
}
