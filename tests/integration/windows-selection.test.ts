import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { windowsSelection } from '../../src/core/process-tree.js'

type Rows = Parameters<typeof windowsSelection>[0]
const rows = [
  { pid: 101, parent: 0, born: '100' },
  { pid: 102, parent: 101, born: '200' },
  { pid: 103, parent: 102, born: '300' },
] as const satisfies Rows

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function runSelection(known: Rows, current: Rows, suffix = ''): string {
  // Replace only the CIM source. Production decoding, validation and ancestry
  // selection execute in Windows PowerShell 5.1; no termination code is run.
  const script = `
$ErrorActionPreference = 'Stop'
function Get-CimInstance {
  $fixtureRows = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(current)}')))
  foreach ($entry in $fixtureRows) {
    [pscustomobject]@{
      ProcessId = $entry.pid
      ParentProcessId = $entry.parent
      CreationDate = [DateTime]::SpecifyKind([DateTime]([long]$entry.born), [DateTimeKind]::Utc)
    }
  }
}
${windowsSelection(known)}
${suffix || `@{known=$known.Count;all=$all.Count;selected=@($selected.Keys | Sort-Object)} | ConvertTo-Json -Compress`}
`
  return execFileSync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
      windowsHide: true,
    },
  )
}

it.skipIf(process.platform !== 'win32').each([
  [0, 0],
  [0, 1],
  [0, 3],
  [1, 0],
  [1, 1],
  [1, 3],
  [3, 0],
  [3, 1],
  [3, 3],
])(
  'selects Windows identities with %i known and %i current rows',
  (known, current) => {
    expect(
      JSON.parse(runSelection(rows.slice(0, known), rows.slice(0, current))),
    ).toEqual({
      known,
      all: current,
      selected: known === 0 ? [] : rows.slice(0, current).map((row) => row.pid),
    })
  },
)

it.skipIf(process.platform !== 'win32')(
  'rejects reused identities and descendants older than their parent',
  () => {
    const current = [
      { ...rows[0], born: '99' },
      rows[1],
      { ...rows[2], born: '199' },
    ]
    expect(JSON.parse(runSelection(rows, current))).toEqual({
      known: 3,
      all: 3,
      selected: [102],
    })
  },
)

it
  .skipIf(process.platform !== 'win32')
  .each(
    [
      null,
      [[rows[0]]],
      [{ ...rows[0], pid: [101, 102] }],
      [{ ...rows[0], pid: '101' }],
      [{ ...rows[0], parent: -1 }],
      [{ ...rows[0], born: ['100'] }],
      [{ ...rows[0], born: '9223372036854775808' }],
    ].map((invalid) => ({ invalid })),
  )('rejects malformed Windows identity evidence $invalid', ({ invalid }) => {
  const suffix = `Read-PeekProcessRows ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(invalid)}')))`
  expect(() => runSelection([], [], suffix)).toThrow(
    /invalid creation identity evidence/,
  )
})
