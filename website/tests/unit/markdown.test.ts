import { describe, expect, it } from 'vitest'
import { extractHeadings, renderMarkdown } from '../../src/lib/markdown.server'

describe('renderMarkdown', () => {
  it('renders a heading with a slug id', async () => {
    const html = await renderMarkdown('## Install it\n')
    expect(html).toContain('<h2 id="install-it">')
  })

  it('renders gfm tables', async () => {
    const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
  })

  it('escapes raw html instead of executing it', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n')
    expect(html).not.toContain('<script>')
  })

  it('highlights fenced code', async () => {
    const html = await renderMarkdown('```sh\npeek\n```\n')
    expect(html).toContain('shiki')
  })
})

describe('extractHeadings', () => {
  it('returns depth, text, and slugified id in order', () => {
    const headings = extractHeadings('# One\n\n## Two words\n\n### Three\n')
    expect(headings).toEqual([
      { depth: 1, text: 'One', id: 'one' },
      { depth: 2, text: 'Two words', id: 'two-words' },
      { depth: 3, text: 'Three', id: 'three' },
    ])
  })

  it('de-duplicates repeated headings like rehype-slug', () => {
    const headings = extractHeadings('## Same\n\n## Same\n')
    expect(headings.map((heading) => heading.id)).toEqual(['same', 'same-1'])
  })
})
