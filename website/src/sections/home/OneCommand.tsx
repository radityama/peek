import { CopyCommand } from '../../components/CopyCommand'
import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { site } from '../../content/site'

const steps = [
  {
    title: 'Install once',
    detail: 'One global install. Peek fetches its own cloudflared.',
  },
  {
    title: 'Run peek',
    detail: 'No flags for the normal case. Peek reads your dev script.',
  },
  {
    title: 'Send the link',
    detail: 'A temporary HTTPS URL, ready in seconds.',
  },
] as const

export function OneCommand() {
  return (
    <Section id="one-command" tone="surface">
      <Eyebrow>One command</Eyebrow>
      <SectionHeading className="mt-4">Nothing to configure.</SectionHeading>
      <p className="mt-6 max-w-2xl text-body-lg text-ink-2">
        Peek looks at the project you are in, finds the dev script, starts it on
        the port it actually binds, and waits until that port answers before it
        shares anything.
      </p>

      <div className="mt-10 max-w-xl">
        <CopyCommand command={site.install.pnpm} />
      </div>

      <ol className="mt-14 grid gap-10 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <p className="font-mono text-mono-xs text-accent-strong">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className="mt-3 text-h3 font-medium">{step.title}</h3>
            <p className="mt-2 text-ink-2">{step.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
