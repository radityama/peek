import type { ReactNode } from 'react'
import type { DocumentHeading } from '../lib/headings'
import { Container } from './Container'
import { DocsNav } from './DocsNav'
import { Eyebrow } from './Eyebrow'

interface DocLayoutProps {
  readonly eyebrow: string
  readonly title: string
  readonly intro?: string
  readonly currentHref: string
  readonly headings?: readonly DocumentHeading[]
  readonly children: ReactNode
}

export function DocLayout({
  eyebrow,
  title,
  intro,
  currentHref,
  headings,
  children,
}: DocLayoutProps) {
  return (
    <Container width="wide" className="py-[clamp(3rem,7vw,5rem)]">
      <div className="grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DocsNav currentHref={currentHref} headings={headings} />
        </aside>
        <div className="min-w-0 max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-h2 font-medium text-balance">{title}</h1>
          {intro ? (
            <p className="mt-5 text-body-lg text-ink-2">{intro}</p>
          ) : null}
          <div className="mt-10">{children}</div>
        </div>
      </div>
    </Container>
  )
}
