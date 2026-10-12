import { Container } from './Container'
import { Eyebrow } from './Eyebrow'
import { TextLink } from './TextLink'

export function NotFound() {
  return (
    <Container className="py-[clamp(6rem,18vw,14rem)]">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 text-h2 font-medium text-balance">
        This route does not exist.
      </h1>
      <p className="mt-6 max-w-xl text-body-lg text-ink-2">
        The link may be old, or the page may not be written yet. Start from the{' '}
        <TextLink href="/">homepage</TextLink> or the{' '}
        <TextLink href="/docs">documentation</TextLink>.
      </p>
    </Container>
  )
}
