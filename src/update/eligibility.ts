export interface UpdateEnvironment {
  CI?: string
  NODE_ENV?: string
  NO_UPDATE_NOTIFIER?: string
}

export function shouldCheckForUpdates(options: {
  isDoctor: boolean
  json: boolean
  env: UpdateEnvironment
}): boolean {
  return (
    !options.isDoctor &&
    !options.json &&
    options.env.CI !== 'true' &&
    options.env.NODE_ENV !== 'test' &&
    options.env.NO_UPDATE_NOTIFIER !== '1'
  )
}
