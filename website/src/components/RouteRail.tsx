import { useMemo } from 'react'
import { useActiveSection } from '../hooks/useActiveSection'
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
  const ids = useMemo(() => stops.map((stop) => stop.id), [stops])
  const active = useActiveSection(ids)

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
        {stops.map((stop, index) => {
          const isActive = stop.id === active
          return (
            <li key={stop.id}>
              <a
                href={`#${stop.id}`}
                aria-current={isActive ? 'true' : undefined}
                className="group flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em]"
              >
                <span
                  className={cn(
                    'h-px transition-all duration-[var(--dur-base)] group-hover:w-8 group-hover:bg-accent',
                    isActive ? 'w-8 bg-accent' : 'w-4 bg-line',
                  )}
                />
                <span
                  className={cn(
                    'transition-colors duration-[var(--dur-base)]',
                    isActive ? 'text-ink' : 'text-ink-3 group-hover:text-ink',
                  )}
                >
                  {String(index + 1).padStart(2, '0')} {stop.label}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
