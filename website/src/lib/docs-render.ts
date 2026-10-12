import { createServerFn } from '@tanstack/react-start'
import { parseChangelog } from '../content/changelog'
import { findDoc } from '../content/docs'
import { changelogMarkdown, securityMarkdown } from '../content/sources.server'
import type { DocumentHeading } from './headings'
import { extractHeadings, renderMarkdown } from './markdown.server'

export interface RenderedDoc {
  readonly html: string
  readonly headings: DocumentHeading[]
}

export interface RenderedRelease {
  readonly version: string
  readonly date: string | null
  readonly html: string
}

/**
 * Route loaders run on the client too; calling the Markdown pipeline from one
 * would ship unified and shiki to the browser.
 */
export const renderDoc = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<RenderedDoc> => {
    const source = findDoc(slug)?.source ?? ''
    return {
      html: await renderMarkdown(source),
      headings: extractHeadings(source),
    }
  })

export const renderSecurityDoc = createServerFn({ method: 'GET' }).handler(
  async (): Promise<RenderedDoc> => ({
    html: await renderMarkdown(securityMarkdown),
    headings: extractHeadings(securityMarkdown),
  }),
)

export const renderChangelog = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ releases: RenderedRelease[] }> => {
    const releases = parseChangelog(changelogMarkdown)
    return {
      releases: await Promise.all(
        releases.map(async (release) => ({
          version: release.version,
          date: release.date,
          html: await renderMarkdown(release.body),
        })),
      ),
    }
  },
)
