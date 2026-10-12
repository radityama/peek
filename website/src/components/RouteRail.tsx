import { cn } from '../lib/cn'

export interface RailStop {
  readonly id: string
  readonly label: string
}

export function RouteRail({
  stops,
  className,
}: {
  readonly stops: readonly RailStop[]
  readonly className?: string
}) {
  if (stops.length === 0) return null
  return (
    <nav
      aria-label="Page sections"
      className={cn(
        'fixed left-6 top-1/2 hidden -translate-y-1/2 xl:block',
        className,
      )}
    >
      <ol className="flex flex-col gap-4">
        {stops.map((stop, index) => (
          <li key={stop.id}>
            <a
              href={`#${stop.id}`}
              className="group flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3"
            >
              <span className="h-px w-4 bg-line transition-all duration-[var(--dur-quick)] group-hover:w-8 group-hover:bg-accent" />
              <span className="transition-colors duration-[var(--dur-quick)] group-hover:text-ink">
                {String(index + 1).padStart(2, '0')} {stop.label}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
