import { createFileRoute } from '@tanstack/react-router'
import { absoluteUrl } from '../content/site'
import { HomePage } from '../sections/home/HomePage'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Peek · Run your dev server. Share it instantly.' },
      {
        name: 'description',
        content:
          'Peek starts your dev server, verifies the port, and opens a temporary HTTPS preview. No account, no config.',
      },
      {
        property: 'og:title',
        content: 'Peek · Run your dev server. Share it instantly.',
      },
      {
        property: 'og:description',
        content:
          'Temporary HTTPS previews for local development. No account, no config, no cloudflared install.',
      },
      { property: 'og:url', content: absoluteUrl('/') },
    ],
    links: [{ rel: 'canonical', href: absoluteUrl('/') }],
  }),
  component: HomePage,
})
