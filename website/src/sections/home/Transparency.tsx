import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { TextLink } from '../../components/TextLink'

const limits = [
  {
    label: 'Dev only',
    detail: 'Peek is for development previews. It is not production hosting.',
  },
  {
    label: 'No uptime promise',
    detail: 'Quick Tunnel links are temporary and can drop.',
  },
  {
    label: 'Rotating hostname',
    detail: 'Every run gets a new random hostname.',
  },
  {
    label: 'No server-sent events',
    detail: 'SSE does not stream through the proxy today.',
  },
  {
    label: 'Protected previews',
    detail:
      'Basic auth consumes the Authorization header before your app sees the request.',
  },
  {
    label: 'No account, no telemetry',
    detail:
      'Peek collects no source code, no environment variables, and no usage data.',
  },
] as const

export function Transparency() {
  return (
    <Section id="limits">
      <Eyebrow>Straight answers</Eyebrow>
      <SectionHeading className="mt-4">Know what Peek is doing.</SectionHeading>
      <p className="mt-6 max-w-2xl text-body-lg text-ink-2">
        Peek shows the access mode, the expiry, and the reason a preview is
        unreachable. Here are the limits worth knowing before you share a link.
      </p>

      <dl className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {limits.map((limit) => (
          <div key={limit.label} className="bg-bg p-6">
            <dt className="font-mono text-mono-xs uppercase tracking-[0.14em] text-accent-strong">
              {limit.label}
            </dt>
            <dd className="mt-3 text-ink-2">{limit.detail}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-ink-2">
        Read the <TextLink href="/security">security model</TextLink> or the{' '}
        <TextLink href="/docs/troubleshooting">troubleshooting guide</TextLink>.
      </p>
    </Section>
  )
}
