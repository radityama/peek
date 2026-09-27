import { randomUUID } from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'
import { valid } from 'semver'

export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000
const LOCK_STALE_MS = 10_000

export interface UpdateRecord {
  checkedAt: number
  latestVersion?: string
}

export async function readCache(
  path: string,
): Promise<UpdateRecord | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof value !== 'object' || value === null) return undefined
    const record = value as Record<string, unknown>
    if (
      !Number.isFinite(record.checkedAt) ||
      typeof record.checkedAt !== 'number'
    )
      return undefined
    if (
      record.latestVersion !== undefined &&
      (typeof record.latestVersion !== 'string' || !valid(record.latestVersion))
    )
      return undefined
    return record.latestVersion === undefined
      ? { checkedAt: record.checkedAt }
      : {
          checkedAt: record.checkedAt,
          latestVersion: record.latestVersion as string,
        }
  } catch {
    return undefined
  }
}

export function isFresh(record: UpdateRecord, now: number): boolean {
  return record.checkedAt <= now && now - record.checkedAt < UPDATE_INTERVAL_MS
}

export async function writeCache(
  path: string,
  record: UpdateRecord,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function claimCheck(
  path: string,
): Promise<(() => Promise<void>) | undefined> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const lockPath = `${path}.lock`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      await handle.close()
      return async () => {
        await rm(lockPath, { force: true })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (attempt > 0) return undefined
      try {
        const lock = await stat(lockPath)
        if (Date.now() - lock.mtimeMs <= LOCK_STALE_MS) return undefined
        await rm(lockPath, { force: true })
      } catch {
        return undefined
      }
    }
  }
  return undefined
}
