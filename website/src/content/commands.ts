export interface PeekCommandOptions {
  readonly password?: boolean
  readonly private?: boolean
  readonly lan?: boolean
  readonly expires?: string
}

export function composePeekCommand(options: PeekCommandOptions): string {
  const parts = ['peek']
  if (options.password) parts.push('--password')
  if (options.private) parts.push('--private')
  if (options.lan) parts.push('--lan')
  if (options.expires) parts.push('--expires', options.expires)
  return parts.join(' ')
}
