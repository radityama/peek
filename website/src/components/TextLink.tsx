import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface TextLinkProps {
  readonly href: string
  readonly children: ReactNode
  readonly className?: string
  readonly external?: boolean
}

export function TextLink({
  href,
  children,
  className,
  external = false,
}: TextLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'text-accent-strong underline decoration-1 underline-offset-4 transition-colors duration-[var(--dur-quick)] hover:text-ink',
        className,
      )}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
