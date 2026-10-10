import { PeekError } from '../utils/errors.js'

export type AccessMode = 'public' | 'protected' | 'private'

export function selectAccessMode(flags: {
  public: boolean | undefined
  private: boolean | undefined
  password: boolean | undefined
  lan: boolean | undefined
}): AccessMode {
  if (flags.public && (flags.private || flags.password || flags.lan)) {
    throw new PeekError(
      'USAGE_ERROR',
      '--public cannot be combined with --private, --password, or --lan.',
      'Choose one access mode for the preview.',
    )
  }
  if (flags.private && (flags.password || flags.lan)) {
    throw new PeekError(
      'USAGE_ERROR',
      '--private cannot be combined with --password or --lan.',
      'Use --private for loopback only, --lan for local Wi-Fi, or --password for a protected tunnel.',
    )
  }
  if (flags.lan && flags.password) {
    throw new PeekError(
      'USAGE_ERROR',
      '--lan cannot be combined with --password.',
      'Use --lan without a public tunnel, or --password for a protected tunnel.',
    )
  }
  if (flags.lan) return 'private'
  if (flags.private) return 'private'
  if (flags.password) return 'protected'
  return 'public'
}

export function parseExpiry(input: string): number {
  const match = /^([1-9]\d*)(s|m|h)$/.exec(input)
  if (!match) {
    throw new PeekError(
      'USAGE_ERROR',
      `Invalid expiry: ${JSON.stringify(input)}.`,
      'Use a positive duration such as --expires 30m or --expires 2h (maximum 24h).',
    )
  }
  const amount = Number(match[1])
  const multiplier =
    match[2] === 's' ? 1000 : match[2] === 'm' ? 60_000 : 3_600_000
  const milliseconds = amount * multiplier
  if (!Number.isSafeInteger(milliseconds) || milliseconds > 86_400_000) {
    throw new PeekError(
      'USAGE_ERROR',
      `Expiry exceeds 24 hours: ${JSON.stringify(input)}.`,
      'Use a duration no longer than 24h.',
    )
  }
  return milliseconds
}
