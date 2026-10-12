import { createFileRoute } from '@tanstack/react-router'
import { Container } from '../components/Container'
import { Eyebrow } from '../components/Eyebrow'
import { Prose } from '../components/Prose'
import { version } from '../content/version'
import { renderChangelog } from '../lib/docs-render'

export const Route = createFileRoute('/changelog')({
  head: () => ({
    meta: [
      { title: 'Changelog · Peek' },
      {
        name: 'description',
        content: 'Every release of the Peek CLI, newest first.',
      },
    ],
  }),
  loader: () => renderChangelog(),
  component: ChangelogPage,
})

function ChangelogPage() {
  const { releases } = Route.useLoaderData()

  return (
    <Container className="py-[clamp(3rem,7vw,5rem)]">
      <Eyebrow>Changelog</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">Release history</h1>
      <p className="mt-5 max-w-2xl text-body-lg text-ink-2">
        Peek is currently on <span className="font-mono">v{version}</span>.
        Every release below is published to npm with provenance.
      </p>

      <div className="mt-16 flex flex-col gap-16">
        {releases.map((release) => (
          <section key={release.version} id={`v${release.version}`}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-4">
              <h2 className="font-mono text-h3 font-medium">
                v{release.version}
              </h2>
              {release.date ? (
                <time
                  dateTime={release.date}
                  className="font-mono text-mono-xs text-ink-3"
                >
                  {release.date}
                </time>
              ) : null}
            </div>
            <Prose className="mt-6" html={release.html} />
          </section>
        ))}
      </div>
    </Container>
  )
}
