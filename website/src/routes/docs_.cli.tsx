import { createFileRoute } from '@tanstack/react-router'
import { DocLayout } from '../components/DocLayout'
import { Prose } from '../components/Prose'
import { TextLink } from '../components/TextLink'
import { renderDoc } from '../lib/docs-render'

export const Route = createFileRoute('/docs_/cli')({
  head: () => ({
    meta: [{ title: 'CLI reference — Peek' }],
  }),
  loader: () => renderDoc({ data: 'cli' }),
  component: CliDoc,
})

function CliDoc() {
  const { html, headings } = Route.useLoaderData()

  return (
    <DocLayout
      eyebrow="Docs"
      title="CLI reference"
      intro="Every flag, exit status, and diagnostic Peek prints."
      currentHref="/docs/cli"
      headings={headings}
    >
      <Prose html={html} />
      <p className="mt-12 text-ink-2">
        Stuck on an error? See the{' '}
        <TextLink href="/docs/troubleshooting">troubleshooting guide</TextLink>.
      </p>
    </DocLayout>
  )
}
