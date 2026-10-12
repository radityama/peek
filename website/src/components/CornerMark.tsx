import { cn } from '../lib/cn'

export function CornerMark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute h-3 w-3 border-l border-t border-line',
        className,
      )}
    />
  )
}
