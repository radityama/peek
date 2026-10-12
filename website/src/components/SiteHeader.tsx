import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { site } from '../content/site'
import { Container } from './Container'
import { NavLink } from './NavLink'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <Container
        width="wide"
        className="flex h-16 items-center justify-between"
      >
        <Link
          to="/"
          className="font-mono text-sm font-medium tracking-tight text-ink"
          onClick={() => setOpen(false)}
        >
          <span className="text-accent-strong">$</span> peek
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {site.nav.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-ink"
            />
          ))}
        </nav>

        <div className="flex items-center gap-4 md:hidden">
          <a
            href={site.github}
            className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="font-mono text-mono-xs uppercase tracking-[0.12em] text-ink"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </Container>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-line bg-bg md:hidden"
        >
          <Container width="wide" className="flex flex-col py-4">
            {site.nav.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                className="py-3 font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2"
              />
            ))}
          </Container>
        </nav>
      ) : null}
    </header>
  )
}
