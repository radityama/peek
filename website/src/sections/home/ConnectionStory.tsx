import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'

const stages = [
  {
    label: 'Here',
    title: 'Your machine',
    detail: 'Peek runs in the project directory and never leaves it.',
  },
  {
    label: 'Verified',
    title: 'The port you own',
    detail:
      'Peek confirms the responding port belongs to the process it started.',
  },
  {
    label: 'There',
    title: 'A link you can send',
    detail:
      'Traffic reaches your app through a loopback proxy that rechecks ownership.',
  },
] as const

export function ConnectionStory() {
  return (
    <Section id="how-it-works" tone="dark" className="overflow-hidden">
      <Eyebrow tone="dark">The route</Eyebrow>
      <SectionHeading className="mt-4">
        From localhost to a link you can send.
      </SectionHeading>

      <ol className="mt-16 grid gap-px overflow-hidden rounded-xl bg-dark-line md:grid-cols-3">
        {stages.map((stage) => (
          <li key={stage.label} className="bg-dark-bg p-8">
            <p className="font-mono text-mono-xs uppercase tracking-[0.14em] text-accent">
              {stage.label}
            </p>
            <h3 className="mt-4 text-h3 font-medium">{stage.title}</h3>
            <p className="mt-3 text-dark-ink-2">{stage.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
