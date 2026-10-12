import { CopyCommand } from '../../components/CopyCommand'
import { PrimaryButton } from '../../components/PrimaryButton'
import { Section } from '../../components/Section'
import { site } from '../../content/site'

export function Signoff() {
  return (
    <Section id="start" tone="dark" className="text-center">
      <h2 className="mx-auto max-w-2xl text-h2 font-medium text-balance">
        Run your dev server. Share it instantly.
      </h2>
      <div className="mx-auto mt-8 max-w-md">
        <CopyCommand command={site.install.pnpm} tone="dark" />
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <PrimaryButton href="/docs" variant="inverse">
          Read the docs
        </PrimaryButton>
        <a
          href={site.github}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-mono-xs uppercase tracking-[0.14em] text-dark-ink-2 hover:text-dark-ink"
        >
          Star on GitHub
        </a>
      </div>
    </Section>
  )
}
