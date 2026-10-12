import { site } from '../content/site'
import { version } from '../content/version'
import { Container } from './Container'
import { NavLink } from './NavLink'

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container width="wide" className="py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <p className="font-mono text-sm font-medium">
              <span className="text-accent-strong">$</span> peek
            </p>
            <p className="mt-4 max-w-xs text-sm text-ink-2">{site.tagline}</p>
            <p className="mt-4 font-mono text-mono-xs text-ink-3">
              v{version} · MIT
            </p>
          </div>
          {site.footer.map((group) => (
            <div key={group.title}>
              <h2 className="font-mono text-mono-xs uppercase tracking-[0.14em] text-ink-3">
                {group.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      item={item}
                      className="text-sm text-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-ink"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </footer>
  )
}
