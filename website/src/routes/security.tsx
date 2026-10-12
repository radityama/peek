import { createFileRoute } from '@tanstack/react-router'
import { PageStub } from '../components/PageStub'

export const Route = createFileRoute('/security')({
  component: () => <PageStub eyebrow="Security" title="Security model" />,
})
