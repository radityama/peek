export interface PeekConfig {
  command?: [string, ...string[]]
  port?: number
  provider?: 'cloudflare'
  qr?: boolean
}

export function defineConfig(config: PeekConfig): PeekConfig {
  return config
}
