import type { UpdateAvailable } from './check.js'

export interface UpdateNotice {
  receive(update: UpdateAvailable | undefined): void
  ready(): void
  stop(): void
}

export function createUpdateNotice(
  show: (update: UpdateAvailable) => void,
): UpdateNotice {
  let update: UpdateAvailable | undefined
  let previewReady = false
  let stopped = false
  let shown = false

  const flush = () => {
    if (!previewReady || stopped || shown || !update) return
    shown = true
    show(update)
  }

  return {
    receive(result) {
      update = result
      flush()
    },
    ready() {
      previewReady = true
      flush()
    },
    stop() {
      stopped = true
    },
  }
}
