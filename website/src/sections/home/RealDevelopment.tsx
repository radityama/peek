import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'

const points = [
  {
    title: 'Hot reload survives the tunnel',
    detail:
      'Peek preserves HTTP framing and proxies WebSocket upgrades, so the preview behaves like your local tab.',
  },
  {
    title: 'Shutdown is deterministic',
    detail:
      'The dev server and the tunnel stop together, and Peek tells you the concrete reason if it cannot confirm every child exited.',
  },
  {
    title: 'Bounded output',
    detail:
      'Dev-server and tunnel output is buffered and streamed, so a chatty build cannot balloon memory.',
  },
] as const

export function RealDevelopment() {
  return (
    <Section id="development" tone="surface">
      <Eyebrow>Real development</Eyebrow>
      <SectionHeading className="mt-4">
        Built for the loop you already use.
      </SectionHeading>
      <ul className="mt-14 grid gap-10 md:grid-cols-3">
        {points.map((point) => (
          <li key={point.title}>
            <h3 className="text-h3 font-medium">{point.title}</h3>
            <p className="mt-3 text-ink-2">{point.detail}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
