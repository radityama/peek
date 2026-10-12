import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface SectionHeadingProps {
  readonly id?: string
  readonly children: ReactNode
  readonly className?: string
}

export function SectionHeading({
  id,
  children,
  className,
}: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className={cn('max-w-3xl text-h2 font-medium text-balance', className)}
    >
      {children}
    </h2>
  )
}
