import { createHash, timingSafeEqual } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const burst = 12
const refillMs = 5_000

function authorized(header: string | undefined, digest: Buffer): boolean {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? '')
  if (!match?.[1]) return false
  const decoded = Buffer.from(match[1], 'base64')
  if (decoded.toString('base64') !== match[1]) return false
  let credential: string
  try {
    credential = utf8.decode(decoded)
  } catch {
    return false
  }
  if (!credential.startsWith('peek:')) return false
  const supplied = createHash('sha256').update(credential.slice(5)).digest()
  return timingSafeEqual(supplied, digest)
}

export function createAuthGate(
  password: string,
  now: () => number = () => performance.now(),
): (header: string | undefined) => 200 | 401 | 429 {
  const digest = createHash('sha256').update(password).digest()
  let tokens = burst
  let previous = now()
  return (header) => {
    if (authorized(header, digest)) return 200
    const current = now()
    tokens = Math.min(
      burst,
      tokens + Math.max(0, current - previous) / refillMs,
    )
    previous = current
    if (tokens < 1) return 429
    tokens -= 1
    return 401
  }
}

export function validWebSocketOrigin(
  header: string | undefined,
  publicOrigin: string | undefined,
): boolean {
  if (header === undefined) return true
  if (publicOrigin === undefined) return false
  try {
    const origin = new URL(header)
    return (
      (origin.protocol === 'http:' || origin.protocol === 'https:') &&
      origin.username === '' &&
      origin.password === '' &&
      origin.pathname === '/' &&
      origin.search === '' &&
      origin.hash === '' &&
      header === origin.origin &&
      origin.origin === publicOrigin
    )
  } catch {
    return false
  }
}
