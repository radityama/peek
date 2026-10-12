export const TERMINAL_STATES = [
  'idle',
  'detected',
  'starting',
  'ready',
  'connecting',
  'connected',
] as const

export type TerminalState = (typeof TERMINAL_STATES)[number]

export type TerminalTone = 'muted' | 'success'

export interface TerminalStep {
  readonly state: Exclude<TerminalState, 'idle'>
  readonly line: string
  readonly tone: TerminalTone
  readonly delayMs: number
}

export const TERMINAL_STEPS: readonly TerminalStep[] = [
  { state: 'detected', line: '✓ pnpm project', tone: 'success', delayMs: 450 },
  {
    state: 'starting',
    line: '· Starting pnpm dev…',
    tone: 'muted',
    delayMs: 650,
  },
  {
    state: 'ready',
    line: '✓ Server ready on localhost:3000',
    tone: 'success',
    delayMs: 850,
  },
  {
    state: 'connecting',
    line: '· Opening tunnel…',
    tone: 'muted',
    delayMs: 600,
  },
  {
    state: 'connected',
    line: '✓ Tunnel connected',
    tone: 'success',
    delayMs: 700,
  },
]

export function stepIndex(state: TerminalState): number {
  return TERMINAL_STATES.indexOf(state) - 1
}

export function visibleSteps(state: TerminalState): readonly TerminalStep[] {
  const index = stepIndex(state)
  if (index < 0) return []
  return TERMINAL_STEPS.slice(0, index + 1)
}

export function nextTerminalState(state: TerminalState): TerminalState {
  const index = TERMINAL_STATES.indexOf(state)
  const next = TERMINAL_STATES[index + 1]
  return next ?? 'connected'
}
