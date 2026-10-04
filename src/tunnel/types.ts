export interface TunnelExit {
  exitCode: number | null
}

export interface TunnelSession {
  readonly url: string
  readonly exited: Promise<TunnelExit>
}

export interface TunnelProvider {
  readonly name: string
  connect(options: { target: URL; signal: AbortSignal }): Promise<TunnelSession>
  disconnect(): Promise<void>
  forceDisconnect?(): void
}

export interface ProviderPreparation {
  signal: AbortSignal
  onDownload: () => void
  onDiagnostic: ((line: string) => void) | undefined
  originHostHeader: 'localhost' | undefined
}
