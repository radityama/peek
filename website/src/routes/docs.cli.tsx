import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs/cli')({
  component: () => <PageStub eyebrow="Docs" title="CLI reference" />,
})
