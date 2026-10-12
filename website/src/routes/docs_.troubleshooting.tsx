import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { renderDoc } from '../lib/docs-render'

export const Route = createFileRoute('/docs_/troubleshooting')({
  head: () => ({
    meta: [{ title: 'Troubleshooting — Peek' }],
  }),
  loader: () => renderDoc({ data: 'troubleshooting' }),
  component: TroubleshootingDoc,
})

function TroubleshootingDoc() {
  const { html, headings } = Route.useLoaderData()

  return (
    <DocLayout
      eyebrow="Docs"
      title="Troubleshooting"
      intro="Why a preview is unreachable, and what to do about it."
      currentHref="/docs/troubleshooting"
      headings={headings}
    >
      <Prose html={html} />
    </DocLayout>
  )
}
