import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/features')({
  component: () => <PageStub eyebrow="Features" title="What Peek does" />,
})
