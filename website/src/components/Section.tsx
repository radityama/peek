import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface SectionProps {
  readonly id?: string
  readonly tone?: 'light' | 'surface' | 'dark'
  readonly className?: string
  readonly children: ReactNode
}

const toneClass = {
  light: '',
  surface: 'bg-surface',
  dark: 'bg-dark-bg text-dark-ink',
} as const

export function Section({
  id,
  tone = 'light',
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative py-[clamp(4rem,10vw,9rem)]',
        toneClass[tone],
        className,
      )}
    >
      <div className="mx-auto w-full max-w-wide px-5 sm:px-8 lg:px-12">
        {children}
      </div>
    </section>
  )
}
