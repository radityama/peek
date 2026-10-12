import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { Eyebrow } from '../components/Eyebrow'
import { TextLink } from '../components/TextLink'

export const Route = createFileRoute('/features')({
  head: () => ({
    meta: [
      { title: 'Features · Peek' },
      {
        name: 'description',
        content:
          'Zero-config previews, verified ports, deterministic shutdown, and honest limits.',
      },
    ],
  }),
  component: FeaturesPage,
})

const features = [
  {
    title: 'Zero config',
    body: 'Peek reads the dev script already in your project. No config file, no account, no flags for the normal case.',
  },
  {
    title: 'Verified port ownership',
    body: 'Peek starts your dev server, finds the port it actually binds, and confirms that port belongs to the process it started before sharing anything.',
  },
  {
    title: 'Managed cloudflared',
    body: 'Peek downloads a pinned Cloudflare binary, verifies its SHA-256 digest, and caches it. You never install cloudflared yourself.',
  },
  {
    title: 'One lifecycle',
    body: 'The dev server and the tunnel stop together on exit, failure, or Ctrl-C, and Peek reports the concrete reason if cleanup cannot confirm every child exited.',
  },
  {
    title: 'Choose your exposure',
    body: 'Public by default, HTTP Basic auth with --password, or no tunnel at all with --private. The terminal always shows which mode is active.',
  },
  {
    title: 'Works with your stack',
    body: 'pnpm, npm, Yarn, or Bun. HTTP and WebSocket upgrades proxy through, so hot reload keeps working.',
  },
] as const

function FeaturesPage() {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Features</Eyebrow>
      <h1 className="mt-4 max-w-3xl text-h2 font-medium text-balance">
        Everything a preview needs. Nothing it does not.
      </h1>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek does one job: turn a local dev server into a temporary link you can
        send. These are the pieces that make that reliable.
      </p>

      <ul className="mt-16 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <li key={feature.title} className="bg-bg p-7">
            <h2 className="text-h3 font-medium">{feature.title}</h2>
            <p className="mt-3 text-ink-2">{feature.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-ink-2">
        Curious about the boundaries? Read the{' '}
        <TextLink href="/security">security model</TextLink>.
      </p>
    </Container>
  )
}
