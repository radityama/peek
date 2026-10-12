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

  it('drops a leading level-1 heading the page already provides', async () => {
    const html = await renderMarkdown('# CLI\n\n## Install\n')
    expect(html).not.toContain('<h1')
    expect(html).toContain('<h2 id="install">')
  })

  it('keeps a level-1 heading that is not leading', async () => {
    const html = await renderMarkdown('Intro\n\n# Later\n')
    expect(html).toContain('<h1 id="later">')
  })
})

describe('extractHeadings', () => {
  it('returns depth, text, and slugified id in order', () => {
    const headings = extractHeadings('## Two words\n\n### Three\n')
    expect(headings).toEqual([
      { depth: 2, text: 'Two words', id: 'two-words' },
      { depth: 3, text: 'Three', id: 'three' },
    ])
  })

  it('skips a leading level-1 heading so slugs match the rendered page', () => {
    const headings = extractHeadings('# CLI\n\n## CLI\n')
    expect(headings).toEqual([{ depth: 2, text: 'CLI', id: 'cli' }])
  })

  it('de-duplicates repeated headings like rehype-slug', () => {
    const headings = extractHeadings('## Same\n\n## Same\n')
    expect(headings.map((heading) => heading.id)).toEqual(['same', 'same-1'])
  })
})
