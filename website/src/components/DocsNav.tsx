import { Link } from '@tanstack/react-router'
import { docsNav } from '../content/docs'
import type { DocumentHeading } from '../lib/headings'

interface DocsNavProps {
  readonly currentHref: string
  readonly headings?: readonly DocumentHeading[] | undefined
}

export function DocsNav({ currentHref, headings = [] }: DocsNavProps) {
  const sections = headings.filter((heading) => heading.depth === 2)

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-8">
      <ul className="flex flex-col gap-2">
        {docsNav.map((entry) => {
          const active = entry.href === currentHref
          return (
            <li key={entry.href}>
              <Link
                to={entry.href as never}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'font-mono text-mono-xs uppercase tracking-[0.12em] text-accent-strong'
                    : 'font-mono text-mono-xs uppercase tracking-[0.12em] text-ink-2 hover:text-ink'
                }
              >
                {entry.title}
              </Link>
            </li>
          )
        })}
      </ul>

      {sections.length > 0 ? (
        <div>
          <p className="font-mono text-mono-xs uppercase tracking-[0.14em] text-ink-3">
            On this page
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {sections.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="text-sm text-ink-2 hover:text-ink"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}
