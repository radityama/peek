import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface EditorialHeadingProps {
  readonly children: ReactNode
  readonly className?: string
}

export function EditorialHeading({
  children,
  className,
}: EditorialHeadingProps) {
  return (
    <p
      className={cn('max-w-2xl text-body-lg text-pretty text-ink-2', className)}
    >
      {children}
    </p>
  )
}
