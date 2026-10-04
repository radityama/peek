import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
    const bytes = await downloadAsset(
      asset.url,
      options.fetcher ?? fetch,
      signal,
    )
    if (sha256(bytes) !== asset.assetSha256) {
      throw new Error(`SHA-256 mismatch for ${asset.name}`)
    }

    if (asset.archive) {
      await writeFile(temporaryArchive, bytes, { mode: 0o600 })
      await execa('tar', ['-xOzf', temporaryArchive, 'cloudflared'], {
        stdout: { file: temporaryBinary },
        timeout: 30_000,
      })
    } else {
      await writeFile(temporaryBinary, bytes, { mode: 0o700 })
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
    const bytes = await readFile(path)
    return sha256(bytes) === expectedHash
  } catch {
    return false
  }
}

async function downloadAsset(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<Buffer> {
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
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of response.body) {
      total += chunk.byteLength
      if (total > MAX_ASSET_BYTES)
        throw new Error('Cloudflared asset exceeded size limit')
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  throw new Error('Cloudflared download redirected too many times')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
