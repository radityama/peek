import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/docs/troubleshooting')({
  component: () => <PageStub eyebrow="Docs" title="Troubleshooting" />,
})
