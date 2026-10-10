import { performance } from 'node:perf_hooks'

/** Share one ownership inspection among concurrent requests and reuse its
 * positive result briefly. Failures are never cached. */
export function coordinateVerification(
  verify: () => Promise<void>,
  ttlMs = 1_000,
  now: () => number = () => performance.now(),
): (fresh?: boolean) => Promise<void> {
  let validUntil = -Infinity
  let pending: Promise<void> | undefined
  return (fresh = false) => {
    if (!fresh && now() < validUntil) return Promise.resolve()
    if (pending) return pending
    pending = Promise.resolve()
      .then(verify)
      .then(() => {
        validUntil = now() + ttlMs
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}
