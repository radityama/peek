import { ensureCloudflared } from '../cloudflared/binary.js'
import { CloudflareProvider } from './cloudflare.js'
import type { ProviderPreparation, TunnelProvider } from './types.js'

export async function prepareProvider(
  options: ProviderPreparation,
): Promise<TunnelProvider> {
  const binaryPath = await ensureCloudflared({
    signal: options.signal,
    onDownload: options.onDownload,
  })
  return new CloudflareProvider(
    binaryPath,
    undefined,
    options.onDiagnostic,
    options.originHostHeader,
  )
}
