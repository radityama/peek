import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs')({
  component: () => <PageStub eyebrow="Docs" title="Documentation" />,
})
