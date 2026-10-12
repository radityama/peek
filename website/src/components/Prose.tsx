import { cn } from '../lib/cn'

interface ProseProps {
  readonly html: string
  readonly className?: string
}

/**
 * Injects HTML produced by `renderMarkdown` from trusted repository Markdown;
 * no runtime or user-supplied content reaches this component.
 */
export function Prose({ html, className }: ProseProps) {
  return (
    <div className={cn('prose', className)}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: build-time trusted docs */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
