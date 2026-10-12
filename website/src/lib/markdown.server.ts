import rehypeShiki from '@shikijs/rehype'
import GithubSlugger from 'github-slugger'
import type { Heading, Root } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { DocumentHeading } from './headings'

/**
 * `@shikijs/rehype` preloads every bundled grammar unless `langs` is given:
 * 346 languages, seconds of cold start, hundreds of dynamic import chunks.
 * Unlisted languages fail the build, so add one here when a docs fence needs
 * it. Plain text needs no entry.
 */
const SHIKI_LANGS = [
  'sh',
  'bash',
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'yaml',
  'toml',
  'diff',
] as const

/**
 * Every docs page supplies its own `h1`, so a leading `# Title` from the source
 * would render a duplicate.
 */
function stripLeadingTitle(tree: Root): void {
  const index = tree.children.findIndex((node) => node.type !== 'html')
  const first = tree.children[index]
  if (first?.type === 'heading' && first.depth === 1) {
    tree.children.splice(index, 1)
  }
}

function remarkStripLeadingTitle() {
  return (tree: Root): void => stripLeadingTitle(tree)
}

/**
 * Raw HTML in the source is dropped by remark-rehype (no rehype-raw), so the
 * output only holds nodes this pipeline created. Server-only: route modules
 * reach it through the server functions in `docs-render.ts`.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStripLeadingTitle)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: {
        className: ['heading-anchor'],
        ariaHidden: 'true',
        tabIndex: -1,
      },
      content: { type: 'text', value: '#' },
    })
    .use(rehypeShiki, { theme: 'github-light', langs: [...SHIKI_LANGS] })
    .use(rehypeStringify)
    .process(markdown)
  return String(file)
}

export function extractHeadings(markdown: string): DocumentHeading[] {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  stripLeadingTitle(tree)
  const slugger = new GithubSlugger()
  const headings: DocumentHeading[] = []
  visit(tree, 'heading', (node: Heading) => {
    const text = mdastToString(node)
    headings.push({ depth: node.depth, text, id: slugger.slug(text) })
  })
  return headings
}
