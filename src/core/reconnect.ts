import { PeekError } from '../utils/errors.js'

const DEFAULT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export class TunnelRecovery {
  private events = 0
  private lastFailure: unknown = undefined
  private readonly delays: readonly number[]

  constructor(delays: readonly number[] = DEFAULT_DELAYS) {
    this.delays = delays.length ? delays : DEFAULT_DELAYS
  }

  get delayMs(): number {
    return this.events === 0
      ? 0
      : (this.delays[Math.min(this.events - 1, this.delays.length - 1)] ??
          30000)
  }

  failed(error: unknown): void {
    this.lastFailure = error
    this.recordEvent()
  }

  dropped(milliseconds: number): void {
    if (milliseconds >= 30000) {
      this.events = 0
      this.lastFailure = undefined
    }
    this.recordEvent()
  }

  private recordEvent(): void {
    this.events++
    if (this.events >= 8) {
      throw new PeekError(
        'TUNNEL_CONNECTION_ERROR',
        'Tunnel recovery stopped after eight consecutive failures or drops.',
        'Check your network with peek doctor, use --verbose for details, and restart Peek after fixing the problem.',
        this.lastFailure,
      )
    }
  }
}
