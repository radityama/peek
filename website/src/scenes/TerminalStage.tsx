import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  nextTerminalState,
  TERMINAL_STEPS,
  type TerminalState,
  visibleSteps,
} from './terminal-machine'

const toneClass = {
  muted: 'text-dark-ink-2',
  success: 'text-dark-success',
} as const

export function TerminalStage() {
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<TerminalState>('connected')
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPlaying(false)
  }, [])

  useEffect(() => stop, [stop])

  const play = useCallback(() => {
    stop()
    if (reduceMotion) {
      setState('connected')
      return
    }
    setState('idle')
    setPlaying(true)
    let current: TerminalState = 'idle'
    const advance = () => {
      const next = nextTerminalState(current)
      const step = TERMINAL_STEPS.find((candidate) => candidate.state === next)
      timer.current = setTimeout(() => {
        current = next
        setState(next)
        if (next === 'connected') {
          setPlaying(false)
          return
        }
        advance()
      }, step?.delayMs ?? 0)
    }
    advance()
  }, [reduceMotion, stop])

  const steps = visibleSteps(state)
  const connected = state === 'connected'

  return (
    <figure className="rounded-xl border border-dark-line bg-dark-bg p-2 shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-dark-line" />
        <figcaption className="ml-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dark-ink-2">
          peek · terminal
        </figcaption>
      </div>
      <div className="min-h-[13rem] rounded-lg bg-dark-surface p-4 font-mono text-mono-xs leading-relaxed text-dark-ink">
        <p>
          <span className="text-dark-accent">$</span> peek
        </p>
        <div aria-live="polite">
          {steps.map((step) => (
            <p key={step.state} className={toneClass[step.tone]}>
              {step.line}
            </p>
          ))}
          {connected ? (
            <div className="mt-3 text-dark-ink-2">
              <p>
                <span className="text-dark-ink">Local</span>{' '}
                http://localhost:3000
              </p>
              <p>
                <span className="text-dark-ink">Public</span>{' '}
                <span className="text-dark-accent">
                  https://quiet-harbor-4f2.peek.run
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="font-mono text-[0.6875rem] text-dark-ink-2">
          Demo. Hostname rotates each run.
        </p>
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="rounded border border-dark-line px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-dark-ink-2 transition-colors duration-[var(--dur-quick)] hover:text-dark-ink disabled:opacity-50"
        >
          {playing ? 'Replaying…' : 'Replay'}
        </button>
      </div>
    </figure>
  )
}
