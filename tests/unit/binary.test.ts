import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ensureCloudflared } from '../../src/cloudflared/binary.js'
import type { CloudflaredAsset } from '../../src/cloudflared/platform.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

function fakeAsset(bytes: Uint8Array): CloudflaredAsset {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return {
    name: 'cloudflared-linux-amd64',
    url: 'https://github.com/cloudflare/cloudflared/releases/download/2026.9.1/cloudflared-linux-amd64',
    assetSha256: digest,
    binarySha256: digest,
    archive: false,
  }
}

async function cache(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'peek-binary-test-'))
  dirs.push(dir)
  return dir
}

it('downloads, verifies, and reuses a cached binary', async () => {
  const bytes = Buffer.from('fake cloudflared executable')
  const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
  const options = { cacheDir: await cache(), asset: fakeAsset(bytes), fetcher }
  const path = await ensureCloudflared(options)
  expect(await readFile(path)).toEqual(bytes)
  expect(await ensureCloudflared(options)).toBe(path)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('redownloads a corrupted cached binary', async () => {
  const bytes = Buffer.from('known binary')
  const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
  const options = { cacheDir: await cache(), asset: fakeAsset(bytes), fetcher }
  const path = await ensureCloudflared(options)
  await writeFile(path, 'tampered')
  await ensureCloudflared(options)
  expect(await readFile(path)).toEqual(bytes)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it.skipIf(process.platform === 'win32')(
  'repairs execute permission on a verified cached binary without downloading again',
  async () => {
    const bytes = Buffer.from('known binary')
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
    const options = {
      cacheDir: await cache(),
      asset: fakeAsset(bytes),
      fetcher,
    }
    const path = await ensureCloudflared(options)
    await chmod(path, 0o600)
    await ensureCloudflared(options)
    expect((await stat(path)).mode & 0o100).toBe(0o100)
    expect(fetcher).toHaveBeenCalledTimes(1)
  },
)

it('streams a download that arrives in many chunks', async () => {
  const bytes = Buffer.from('chunked cloudflared payload')
  const fetcher = vi.fn(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    })
    return new Response(stream, { status: 200 })
  })
  const path = await ensureCloudflared({
    cacheDir: await cache(),
    asset: fakeAsset(bytes),
    fetcher,
  })
  expect(await readFile(path)).toEqual(bytes)
})

it('rejects an asset whose checksum is wrong', async () => {
  const bytes = Buffer.from('wrong data')
  const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
  const asset = fakeAsset(Buffer.from('expected data'))
  await expect(
    ensureCloudflared({ cacheDir: await cache(), asset, fetcher }),
  ).rejects.toMatchObject({
    code: 'CLOUDFLARED_INSTALL_ERROR',
  })
})

it('does not fetch after cancellation', async () => {
  const controller = new AbortController()
  controller.abort()
  const bytes = Buffer.from('known binary')
  const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
  await expect(
    ensureCloudflared({
      cacheDir: await cache(),
      asset: fakeAsset(bytes),
      fetcher,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: 'CLOUDFLARED_INSTALL_ERROR' })
  expect(fetcher).not.toHaveBeenCalled()
})

it('classifies cache directory failure before download or execution', async () => {
  const root = join(await cache(), 'cache-is-file')
  await writeFile(root, 'not a directory')
  const bytes = Buffer.from('known binary')
  const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }))
  await expect(
    ensureCloudflared({ cacheDir: root, asset: fakeAsset(bytes), fetcher }),
  ).rejects.toMatchObject({
    code: 'CLOUDFLARED_INSTALL_ERROR',
    hint: expect.stringContaining('writable directory'),
    cause: expect.any(Error),
  })
  expect(fetcher).not.toHaveBeenCalled()
})

it('rejects redirects outside trusted HTTPS hosts', async () => {
  const bytes = Buffer.from('known binary')
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://example.org/cloudflared' },
      }),
  )
  await expect(
    ensureCloudflared({
      cacheDir: await cache(),
      asset: fakeAsset(bytes),
      fetcher,
    }),
  ).rejects.toMatchObject({ code: 'CLOUDFLARED_INSTALL_ERROR' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
