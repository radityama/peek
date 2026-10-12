import { CopyCommand } from '../../components/CopyCommand'
import { Eyebrow } from '../../components/Eyebrow'
import { TextLink } from '../../components/TextLink'
import { site } from '../../content/site'
import { HeroStage } from '../../scenes/HeroStage'

export function HomeHero() {
  return (
    <section className="relative border-b border-line pb-[clamp(4rem,9vw,7rem)] pt-[clamp(3rem,7vw,6rem)]">
      <div className="mx-auto w-full max-w-wide px-5 sm:px-8 lg:px-12">
        <Eyebrow>Temporary previews for local development</Eyebrow>
        <h1 className="mt-5 max-w-4xl text-display font-medium text-balance">
          Run it here. Open it anywhere.
        </h1>
        <p className="mt-6 max-w-2xl text-body-lg text-pretty text-ink-2">
          Peek starts your dev server, checks that the port it found is the port
          it owns, and opens a temporary HTTPS link. No account, no config, no
          cloudflared install.
        </p>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center">
          <CopyCommand command={site.install.pnpm} />
          <TextLink href={site.npm} external>
            or install from npm
          </TextLink>
        </div>

        <div className="mt-12">
          <HeroStage />
        </div>

        <p className="mt-8 font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-3">
          Public preview · Development only · No uptime guarantee · Hostname
          changes each run
        </p>
      </div>
    </section>
  )
}
