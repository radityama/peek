import { describe, expect, it } from 'vitest'
import {
  nextTerminalState,
  stepIndex,
  TERMINAL_STEPS,
  visibleSteps,
} from '../../src/scenes/terminal-machine'

describe('terminal machine', () => {
  it('advances from idle through every step to connected', () => {
    expect(nextTerminalState('idle')).toBe('detected')
    expect(nextTerminalState('detected')).toBe('starting')
    expect(nextTerminalState('starting')).toBe('ready')
    expect(nextTerminalState('ready')).toBe('connecting')
    expect(nextTerminalState('connecting')).toBe('connected')
  })

  it('is idempotent at the terminal state', () => {
    expect(nextTerminalState('connected')).toBe('connected')
  })

  it('reports idle as index -1', () => {
    expect(stepIndex('idle')).toBe(-1)
  })

  it('reveals steps in order', () => {
    expect(visibleSteps('idle')).toHaveLength(0)
    expect(visibleSteps('ready')).toHaveLength(3)
    expect(visibleSteps('connected')).toHaveLength(TERMINAL_STEPS.length)
  })

  it('ends on a success line', () => {
    const last = TERMINAL_STEPS[TERMINAL_STEPS.length - 1]
    expect(last?.tone).toBe('success')
    expect(last?.line).toContain('Tunnel')
  })
})
