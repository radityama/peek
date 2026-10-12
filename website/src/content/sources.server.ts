import changelogSource from '../../../CHANGELOG.md?raw'
import securitySource from '../../../docs/SECURITY.md?raw'

/**
 * Raw Markdown only the server needs; a `.server.ts` module keeps the source
 * text out of the client bundle.
 */
export const changelogMarkdown: string = changelogSource
export const securityMarkdown: string = securitySource
