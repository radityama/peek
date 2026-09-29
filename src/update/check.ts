import { homedir } from 'node:os'
import { join } from 'node:path'
import { gt, prerelease, valid } from 'semver'
import { claimCheck, isFresh, readCache, writeCache } from './cache.js'

const REGISTRY_URL =
  'https://registry.npmjs.org/-/package/@usepeek%2fpeek/dist-tags'

export interface UpdateAvailable {
  current: string
  latest: string
}

export interface UpdateCheckOptions {
  currentVersion: string
  signal?: AbortSignal
  now?: () => number
  cachePath?: string
  timeoutMs?: number
  requestLatest?: (signal: AbortSignal) => Promise<string>
}

export async function requestLatest(signal: AbortSignal): Promise<string> {
  const response = await fetch(REGISTRY_URL, {
    signal,
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Registry request failed')
  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).latest !== 'string'
  )
    throw new Error('Invalid registry response')
  return (data as { latest: string }).latest
}

function available(
  current: string,
  latest: string,
): UpdateAvailable | undefined {
  if (!valid(current) || !valid(latest) || !gt(latest, current))
    return undefined
  if (!prerelease(current) && prerelease(latest)) return undefined
  return { current, latest }
}

export async function checkForUpdate(
  options: UpdateCheckOptions,
): Promise<UpdateAvailable | undefined> {
  const now = options.now?.() ?? Date.now()
  const cachePath =
    options.cachePath ?? join(homedir(), '.peek', 'update-check.json')
  const signal = options.signal
  if (signal?.aborted) return undefined
  try {
    const cached = await readCache(cachePath)
    if (cached && isFresh(cached, now))
      return cached.latestVersion
        ? available(options.currentVersion, cached.latestVersion)
        : undefined

    const release = await claimCheck(cachePath)
    if (!release) return undefined
    try {
      const current = await readCache(cachePath)
      if (current && isFresh(current, now))
        return current.latestVersion
          ? available(options.currentVersion, current.latestVersion)
          : undefined

      // Persist the attempt first so failed requests and process exits share the cooldown.
      await writeCache(cachePath, { checkedAt: now })
      if (signal?.aborted) return undefined
      const deadline = AbortSignal.timeout(options.timeoutMs ?? 2_000)
      const requestSignal = signal
        ? AbortSignal.any([signal, deadline])
        : deadline
      const latest = await (options.requestLatest ?? requestLatest)(
        requestSignal,
      )
      if (requestSignal.aborted || !valid(latest)) return undefined
      await writeCache(cachePath, { checkedAt: now, latestVersion: latest })
      return available(options.currentVersion, latest)
    } finally {
      await release()
    }
  } catch {
    return undefined
  }
}
