import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface EyebrowProps {
  readonly children: ReactNode
  readonly className?: string
  readonly tone?: 'light' | 'dark'
}

export function Eyebrow({ children, className, tone = 'light' }: EyebrowProps) {
  return (
    <p
      className={cn(
        'font-mono text-mono-xs uppercase tracking-[0.14em]',
        tone === 'dark' ? 'text-dark-ink-2' : 'text-ink-2',
        className,
      )}
    >
      {children}
    </p>
  )
}
