import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, lstat, mkdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execa } from 'execa'
import { PeekError } from '../utils/errors.js'
import {
  CLOUDFLARED_VERSION,
  type CloudflaredAsset,
  selectCloudflaredAsset,
} from './platform.js'

const MAX_ASSET_BYTES = 100_000_000
const MAX_REDIRECTS = 5

export interface BinaryOptions {
  cacheDir?: string
  asset?: CloudflaredAsset
  fetcher?: typeof fetch
  signal?: AbortSignal
  platform?: string
  arch?: string
  onDownload?: () => void
}

export async function inspectCachedCloudflared(
  options: Pick<BinaryOptions, 'cacheDir' | 'platform' | 'arch'> = {},
): Promise<'verified' | 'missing-or-invalid'> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const asset = selectCloudflaredAsset(platform, arch)
  const path = cachedBinaryPath(platform, arch, options.cacheDir)
  return (await validCachedBinary(path, asset.binarySha256))
    ? 'verified'
    : 'missing-or-invalid'
}

export async function ensureCloudflared(
  options: BinaryOptions = {},
): Promise<string> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const asset = options.asset ?? selectCloudflaredAsset(platform, arch)
  const root = options.cacheDir ?? join(homedir(), '.peek', 'bin')
  const folder = join(root, `${platform}-${arch}`)
  const suffix = platform === 'win32' ? '.exe' : ''
  const binaryPath = cachedBinaryPath(platform, arch, options.cacheDir)

  if (await validCachedBinary(binaryPath, asset.binarySha256)) {
    try {
      if (platform !== 'win32') await chmod(binaryPath, 0o700)
      return binaryPath
    } catch (cause) {
      throw new PeekError(
        'CLOUDFLARED_INSTALL_ERROR',
        'Peek could not make the verified Cloudflare tunnel engine executable.',
        'Check permissions under ~/.peek/bin and retry.',
        cause,
      )
    }
  }

  try {
    await mkdir(folder, { recursive: true, mode: 0o700 })
  } catch (cause) {
    throw new PeekError(
      'CLOUDFLARED_INSTALL_ERROR',
      'Peek could not create the Cloudflare tunnel engine cache directory.',
      'Check that ~/.peek/bin is a writable directory and retry.',
      cause,
    )
  }
  const nonce = randomUUID()
  const temporaryBinary = join(folder, `.cloudflared-${nonce}${suffix}`)
  const temporaryArchive = join(folder, `.cloudflared-${nonce}.tgz`)
  try {
    options.signal?.throwIfAborted()
    options.onDownload?.()
    const timeout = AbortSignal.timeout(60_000)
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout
    const assetDigest = await downloadAsset(
      asset.url,
      asset.archive ? temporaryArchive : temporaryBinary,
      asset.archive ? 0o600 : 0o700,
      options.fetcher ?? fetch,
      signal,
    )
    if (assetDigest !== asset.assetSha256) {
      throw new Error(`SHA-256 mismatch for ${asset.name}`)
    }

    if (asset.archive) {
      await execa('tar', ['-xOzf', temporaryArchive, 'cloudflared'], {
        stdout: { file: temporaryBinary },
        timeout: 30_000,
      })
    }
    if (!(await validCachedBinary(temporaryBinary, asset.binarySha256))) {
      throw new Error(`Executable SHA-256 mismatch for ${asset.name}`)
    }
    if (platform !== 'win32') await chmod(temporaryBinary, 0o700)
    try {
      await rename(temporaryBinary, binaryPath)
    } catch (cause) {
      // Windows does not replace an existing cache file with rename. A peer
      // may also have completed the same verified download first.
      if (await validCachedBinary(binaryPath, asset.binarySha256))
        return binaryPath
      await rm(binaryPath, { force: true })
      try {
        await rename(temporaryBinary, binaryPath)
      } catch {
        if (await validCachedBinary(binaryPath, asset.binarySha256))
          return binaryPath
        throw cause
      }
    }
    return binaryPath
  } catch (cause) {
    if (cause instanceof PeekError) throw cause
    throw new PeekError(
      'CLOUDFLARED_INSTALL_ERROR',
      'Peek could not prepare the Cloudflare tunnel engine.',
      'Check your internet connection and retry. Use --verbose for download details.',
      cause,
    )
  } finally {
    await Promise.all([
      rm(temporaryBinary, { force: true }),
      rm(temporaryArchive, { force: true }),
    ])
  }
}

function cachedBinaryPath(
  platform: string,
  arch: string,
  cacheDir?: string,
): string {
  const root = cacheDir ?? join(homedir(), '.peek', 'bin')
  const suffix = platform === 'win32' ? '.exe' : ''
  return join(
    root,
    `${platform}-${arch}`,
    `cloudflared-${CLOUDFLARED_VERSION}${suffix}`,
  )
}

async function validCachedBinary(
  path: string,
  expectedHash: string,
): Promise<boolean> {
  try {
    const stat = await lstat(path)
    if (!stat.isFile()) return false
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    return hash.digest('hex') === expectedHash
  } catch {
    return false
  }
}

async function downloadAsset(
  url: string,
  destination: string,
  mode: number,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  let current = url
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const parsed = new URL(current)
    if (
      parsed.protocol !== 'https:' ||
      (parsed.hostname !== 'github.com' &&
        !parsed.hostname.endsWith('.githubusercontent.com'))
    ) {
      throw new Error(
        'Cloudflared download redirected outside the trusted HTTPS hosts',
      )
    }
    const response = await fetcher(current, { redirect: 'manual', signal })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location)
        throw new Error('Cloudflared download redirect had no location')
      current = new URL(location, current).href
      continue
    }
    if (!response.ok || !response.body) {
      throw new Error(`Cloudflared download returned HTTP ${response.status}`)
    }
    return await writeVerifiedBody(response.body, destination, mode)
  }
  throw new Error('Cloudflared download redirected too many times')
}

/**
 * Stream the response to disk while hashing and enforcing the size limit, so a
 * first download never holds the whole asset in memory.
 */
async function writeVerifiedBody(
  body: ReadableStream<Uint8Array>,
  destination: string,
  mode: number,
): Promise<string> {
  const hash = createHash('sha256')
  let total = 0
  const meter = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      total += chunk.byteLength
      if (total > MAX_ASSET_BYTES) {
        callback(new Error('Cloudflared asset exceeded size limit'))
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(body),
    meter,
    createWriteStream(destination, { mode }),
  )
  return hash.digest('hex')
}
