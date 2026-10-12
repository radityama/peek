import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="mx-auto max-w-content px-5 py-24">
      <h1 className="text-display">Peek</h1>
    </div>
  ),
})
