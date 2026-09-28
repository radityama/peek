import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  claimCheck,
  isFresh,
  readCache,
  writeCache,
} from '../../src/update/cache.js'

let directory: string
let path: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'peek-update-cache-'))
  path = join(directory, 'update-check.json')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('reads valid success and failure records and rejects corrupt content', async () => {
  expect(await readCache(path)).toBeUndefined()
  await writeCache(path, { checkedAt: 100, latestVersion: '0.2.1' })
  expect(await readCache(path)).toEqual({
    checkedAt: 100,
    latestVersion: '0.2.1',
  })
  await writeCache(path, { checkedAt: 200 })
  expect(await readCache(path)).toEqual({ checkedAt: 200 })
  await writeFile(
    path,
    JSON.stringify({ checkedAt: 100, latestVersion: 'wrong' }),
  )
  expect(await readCache(path)).toBeUndefined()
})

it('uses a 24-hour interval', () => {
  expect(isFresh({ checkedAt: 100 }, 100 + 86_399_999)).toBe(true)
  expect(isFresh({ checkedAt: 100 }, 100 + 86_400_000)).toBe(false)
  expect(isFresh({ checkedAt: 200 }, 100)).toBe(false)
})

it('allows only one claimant at a time', async () => {
  const release = await claimCheck(path)
  expect(release).toBeTypeOf('function')
  expect(await claimCheck(path)).toBeUndefined()
  await release?.()
  const secondRelease = await claimCheck(path)
  expect(secondRelease).toBeTypeOf('function')
  await secondRelease?.()
})

it('recovers a stale lock without letting its former owner release the replacement', async () => {
  const oldRelease = await claimCheck(path)
  expect(oldRelease).toBeTypeOf('function')
  const old = new Date(Date.now() - 20_000)
  await utimes(`${path}.lock`, old, old)
  const newRelease = await claimCheck(path)
  expect(newRelease).toBeTypeOf('function')
  await oldRelease?.()
  expect(await claimCheck(path)).toBeUndefined()
  await newRelease?.()
  const finalRelease = await claimCheck(path)
  expect(finalRelease).toBeTypeOf('function')
  await finalRelease?.()
})
