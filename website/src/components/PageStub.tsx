import { Container } from './Container'
import { Eyebrow } from './Eyebrow'

interface PageStubProps {
  readonly eyebrow: string
  readonly title: string
}

export function PageStub({ eyebrow, title }: PageStubProps) {
  return (
    <Container className="py-[clamp(6rem,16vw,12rem)]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">{title}</h1>
      <p className="mt-6 max-w-xl text-body-lg text-ink-2">
        This page is scheduled for the next implementation plan.
      </p>
    </Container>
  )
}
