import { useCopy } from '../hooks/useCopy'
import { cn } from '../lib/cn'

interface CopyCommandProps {
  readonly command: string
  readonly label?: string
  readonly className?: string
  readonly tone?: 'light' | 'dark'
}

const feedback: Record<string, string> = {
  idle: 'Copy',
  copied: 'Copied',
  error: 'Copy failed',
}

export function CopyCommand({
  command,
  label = 'Copy install command',
  className,
  tone = 'light',
}: CopyCommandProps) {
  const { state, copy } = useCopy()
  const dark = tone === 'dark'

  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-4 rounded-lg border px-4 py-3 font-mono text-mono-xs',
        dark
          ? 'border-dark-line bg-dark-surface text-dark-ink'
          : 'border-line bg-surface text-ink',
        className,
      )}
    >
      <code className="overflow-x-auto whitespace-pre">
        <span
          className={cn('select-none', dark ? 'text-dark-ink-2' : 'text-ink-3')}
        >
          ${' '}
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => copy(command)}
        aria-label={label}
        className={cn(
          'shrink-0 rounded border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors duration-[var(--dur-quick)]',
          dark
            ? 'border-dark-line text-dark-ink-2 hover:text-dark-ink'
            : 'border-line text-ink-2 hover:text-ink',
        )}
      >
        {feedback[state] ?? 'Copy'}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Command copied to clipboard' : ''}
        {state === 'error' ? 'Copy failed' : ''}
      </span>
    </div>
  )
}
