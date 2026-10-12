import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PrimaryButtonProps {
  readonly href: string
  readonly children: ReactNode
  readonly className?: string
  readonly external?: boolean
  readonly variant?: 'solid' | 'inverse'
}

const buttonVariant = {
  solid: 'bg-ink text-bg hover:bg-accent-strong',
  inverse: 'bg-dark-ink text-dark-bg hover:bg-accent hover:text-dark-ink',
} as const

export function PrimaryButton({
  href,
  children,
  className,
  external = false,
  variant = 'solid',
}: PrimaryButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]',
        buttonVariant[variant],
        className,
      )}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
