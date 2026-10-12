import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'error'

export function useCopy(resetAfterMs = 2000) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setState('copied')
      } catch {
        setState('error')
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), resetAfterMs)
    },
    [resetAfterMs],
  )

  return { state, copy } as const
}
