import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, requestLatest } from '../../src/update/check.js'

describe('update check', () => {
  let directory: string
  let cachePath: string
  const now = 1_800_000_000_000

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'peek-update-'))
    cachePath = join(directory, 'update-check.json')
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    ['0.2.0', '0.2.0', undefined],
    ['0.2.0', '0.2.1', { current: '0.2.0', latest: '0.2.1' }],
    ['0.2.1', '0.2.2', { current: '0.2.1', latest: '0.2.2' }],
    ['0.2.0', '0.1.9', undefined],
    ['0.2.0', '0.3.0-beta.1', undefined],
    ['0.3.0-beta.1', '0.3.0', { current: '0.3.0-beta.1', latest: '0.3.0' }],
  ])('compares %s and %s', async (currentVersion, latest, result) => {
    expect(
      await checkForUpdate({
        currentVersion,
        cachePath,
        now: () => now,
        requestLatest: async () => latest,
      }),
    ).toEqual(result)
  })

  it('reuses successful cache until the 24-hour interval expires', async () => {
    const requestLatest = vi.fn(async () => '0.2.1')
    const options = { currentVersion: '0.2.0', cachePath, requestLatest }
    await checkForUpdate({ ...options, now: () => now })
    await checkForUpdate({ ...options, now: () => now + 86_399_999 })
    expect(requestLatest).toHaveBeenCalledTimes(1)
    await checkForUpdate({ ...options, now: () => now + 86_400_000 })
    expect(requestLatest).toHaveBeenCalledTimes(2)
  })

  it('cools down a failed request for 24 hours', async () => {
    const requestLatest = vi.fn(async () => {
      throw new Error('offline')
    })
    const options = { currentVersion: '0.2.0', cachePath, requestLatest }
    expect(await checkForUpdate({ ...options, now: () => now })).toBeUndefined()
    expect(
      await checkForUpdate({ ...options, now: () => now + 1_000 }),
    ).toBeUndefined()
    expect(requestLatest).toHaveBeenCalledTimes(1)
    await checkForUpdate({ ...options, now: () => now + 86_400_000 })
    expect(requestLatest).toHaveBeenCalledTimes(2)
    expect(JSON.parse(await readFile(cachePath, 'utf8'))).toEqual({
      checkedAt: now + 86_400_000,
    })
  })

  it('ignores a corrupt cache and repairs it after a successful request', async () => {
    await writeFile(cachePath, '{broken')
    expect(
      await checkForUpdate({
        currentVersion: '0.2.0',
        cachePath,
        now: () => now,
        requestLatest: async () => '0.2.1',
      }),
    ).toEqual({ current: '0.2.0', latest: '0.2.1' })
  })

  it('returns silently when the request times out', async () => {
    const requestLatest = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('timeout')), {
          once: true,
        })
      })
    expect(
      await checkForUpdate({
        currentVersion: '0.2.0',
        cachePath,
        now: () => now,
        timeoutMs: 5,
        requestLatest,
      }),
    ).toBeUndefined()
  })

  it('allows only one concurrent registry request', async () => {
    let complete: (version: string) => void = () => {}
    let markStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const requestLatest = vi.fn(() => {
      markStarted()
      return new Promise<string>((resolve) => {
        complete = resolve
      })
    })
    const options = {
      currentVersion: '0.2.0',
      cachePath,
      now: () => now,
      requestLatest,
    }
    const first = checkForUpdate(options)
    await started
    await rm(cachePath)
    const second = checkForUpdate(options)
    expect(await second).toBeUndefined()
    complete('0.2.1')
    expect(await first).toEqual({ current: '0.2.0', latest: '0.2.1' })
    expect(requestLatest).toHaveBeenCalledTimes(1)
  })

  it('ignores cache write failures without a registry request', async () => {
    const requestLatest = vi.fn(async () => '0.2.1')
    expect(
      await checkForUpdate({
        currentVersion: '0.2.0',
        cachePath: directory,
        now: () => now,
        requestLatest,
      }),
    ).toBeUndefined()
    expect(requestLatest).not.toHaveBeenCalled()
  })

  it('does not request after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const requestLatest = vi.fn(async () => '0.2.1')
    expect(
      await checkForUpdate({
        currentVersion: '0.2.0',
        cachePath,
        signal: controller.signal,
        requestLatest,
      }),
    ).toBeUndefined()
    expect(requestLatest).not.toHaveBeenCalled()
  })

  it('requests only the package dist-tags without project details', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ latest: '0.2.1' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      expect(await requestLatest(new AbortController().signal)).toBe('0.2.1')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.npmjs.org/-/package/@usepeek%2fpeek/dist-tags',
        expect.objectContaining({ headers: { accept: 'application/json' } }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
