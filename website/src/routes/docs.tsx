import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { CopyCommand } from '../components/CopyCommand'
import { Eyebrow } from '../components/Eyebrow'
import { TextLink } from '../components/TextLink'
import { site } from '../content/site'

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Documentation — Peek' },
      {
        name: 'description',
        content:
          'Install Peek, run your dev server, and share a temporary preview.',
      },
    ],
  }),
  component: DocsIndex,
})

const steps = [
  {
    title: 'Install',
    body: 'Peek needs Node.js 22 or newer. Install it once, globally.',
  },
  {
    title: 'Run it in a project',
    body: 'Peek reads your dev script and starts it on the port it actually binds.',
  },
  {
    title: 'Send the link',
    body: 'Peek waits for the port to answer, then opens a temporary HTTPS URL.',
  },
] as const

function DocsIndex() {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Docs</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">Quick start</h1>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek is a zero-config CLI. It runs one project's dev server and shares
        the verified port through one temporary HTTPS link.
      </p>

      <div className="mt-8 max-w-xl">
        <CopyCommand command={site.install.pnpm} />
      </div>

      <ol className="mt-14 grid gap-10 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <p className="font-mono text-mono-xs text-accent-strong">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h2 className="mt-3 text-h3 font-medium">{step.title}</h2>
            <p className="mt-2 text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-16 flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-8">
        <TextLink href="/docs/cli">CLI reference</TextLink>
        <TextLink href="/docs/troubleshooting">Troubleshooting</TextLink>
        <TextLink href="/security">Security model</TextLink>
        <TextLink href="/changelog">Changelog</TextLink>
      </div>
    </Container>
  )
}
