export interface ChangelogRelease {
  readonly version: string
  readonly date: string | null
  readonly body: string
}

const RELEASE_HEADING = /^##\s+(\S+?)(?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?\s*$/

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: {
    version: string
    date: string | null
    lines: string[]
  } | null = null

  const flush = () => {
    if (!current) return
    releases.push({
      version: current.version,
      date: current.date,
      body: current.lines.join('\n').trim(),
    })
  }

  for (const line of markdown.split(/\r?\n/)) {
    const match = RELEASE_HEADING.exec(line)
    if (match) {
      flush()
      current = { version: match[1] ?? '', date: match[2] ?? null, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()

  return releases
}
