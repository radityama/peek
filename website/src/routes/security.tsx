import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { renderSecurityDoc } from '../lib/docs-render'

export const Route = createFileRoute('/security')({
  head: () => ({
    meta: [
      { title: 'Security model — Peek' },
      {
        name: 'description',
        content:
          'How Peek handles binary trust, credentials, and network exposure while sharing a development port.',
      },
    ],
  }),
  loader: () => renderSecurityDoc(),
  component: SecurityPage,
})

function SecurityPage() {
  const { html, headings } = Route.useLoaderData()
  return (
    <DocLayout
      eyebrow="Security"
      title="Security model"
      intro="Peek shares a development port to the public internet. This page is the honest account of what that means."
      currentHref="/security"
      headings={headings}
    >
      <Prose html={html} />
    </DocLayout>
  )
}
