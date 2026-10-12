import changelogSource from '../../../CHANGELOG.md?raw'
import securitySource from '../../../docs/SECURITY.md?raw'

/**
 * Raw Markdown that only the server ever needs. Keeping these imports in a
 * `.server.ts` module keeps the source text out of the client bundle.
 */
export const changelogMarkdown: string = changelogSource
export const securityMarkdown: string = securitySource
