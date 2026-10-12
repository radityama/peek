import type { ElementType, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface ContainerProps {
  readonly as?: ElementType
  readonly width?: 'content' | 'wide'
  readonly className?: string
  readonly children: ReactNode
}

export function Container({
  as: Component = 'div',
  width = 'content',
  className,
  children,
}: ContainerProps) {
  return (
    <Component
      className={cn(
        'mx-auto w-full px-5 sm:px-8 lg:px-12',
        width === 'wide' ? 'max-w-wide' : 'max-w-content',
        className,
      )}
    >
      {children}
    </Component>
  )
}
