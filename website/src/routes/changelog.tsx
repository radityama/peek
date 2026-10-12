import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/changelog')({
  component: () => <PageStub eyebrow="Changelog" title="Release history" />,
})
