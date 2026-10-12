import { Eyebrow } from '../../components/Eyebrow'
import { Section } from '../../components/Section'
import { SectionHeading } from '../../components/SectionHeading'
import { composePeekCommand } from '../../content/commands'

const modes = [
  {
    name: 'Public',
    command: composePeekCommand({}),
    detail: 'Anyone with the link can open the preview.',
    note: null,
  },
  {
    name: 'Password',
    command: composePeekCommand({ password: true }),
    detail: 'HTTP Basic auth runs in the local proxy.',
    note: 'Peek removes the credential before the request reaches your app, so your app must not rely on the Authorization header.',
  },
  {
    name: 'Private',
    command: composePeekCommand({ private: true }),
    detail: 'No public tunnel at all. Only your machine can reach it.',
    note: 'Peek does not rebind your app; it stops the tunnel and keeps the local URL.',
  },
] as const

export function ShareIntent() {
  return (
    <Section id="sharing">
      <Eyebrow>Sharing</Eyebrow>
      <SectionHeading className="mt-4">
        Share the way the moment needs.
      </SectionHeading>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {modes.map((mode) => (
          <article
            key={mode.name}
            className="flex flex-col rounded-xl border border-line p-6"
          >
            <h3 className="text-h3 font-medium">{mode.name}</h3>
            <p className="mt-3 text-ink-2">{mode.detail}</p>
            <code className="mt-5 overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-mono-xs">
              {mode.command}
            </code>
            {mode.note ? (
              <p className="mt-4 text-sm text-ink-3">{mode.note}</p>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  )
}
