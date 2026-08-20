// The zero-CDN rule, applied to the marketing site (ADR-0019, ADR-0045 §5).
//
// Nothing this site serves may be fetched from another origin: no font CDN,
// no analytics tag, no hosted stylesheet. The console enforces this with
// `console/tools/check-zero-cdn.mjs`, which tolerates no external URL in HTML
// at all — it can afford that, because a console has no reason to link out.
//
// A front door does. "Follow the build on GitHub" is a hyperlink: a place the
// reader may choose to go, not a resource the browser fetches on their behalf,
// and the rule was never about where a reader is allowed to click. So this
// check draws the line where the rule actually is — at sub-resources. An
// external URL is a failure everywhere except as the `href` of an `<a>` or an
// `<area>`, and in CSS wherever `url()` or `@import` can reach.
//
// XML namespace identifiers are the one exception: `xmlns` is a name, not an
// address, and no parser has ever dereferenced one. An SVG cannot be authored
// without it.
//
// Usage: node tools/check-external-assets.mjs [dir]

import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// Every file type a browser can be made to fetch something from. Plain text
// is absent on purpose: the two OFL licences name the foundries' URLs in
// their prose, and prose causes no fetch. Markdown is absent for the same
// reason — nothing here renders it.
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.webmanifest'])

// `tools/` is the checking machinery itself, which reaches GitHub at build
// time by design and is never served.
const SKIP_DIRECTORIES = new Set(['.git', '.github', 'tools'])

const NAMESPACES = [/^https?:\/\/www\.w3\.org\//]
const URL_PATTERN = /(?:https?:)?\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?![a-z0-9.-])[^\s"'`)<>\\]*/gi

// `<a href>` and `<area href>` — the two attributes that name somewhere the
// reader may go rather than something the browser will fetch.
const LINK_ATTRIBUTE = /<(a|area)\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')

let scanned = 0
const violations = []
for await (const path of walk(root)) {
  if (!TEXT_EXTENSIONS.has(extname(path))) continue
  scanned++
  const text = await readFile(path, 'utf8')

  // Every URL that is the destination of a hyperlink. Counted rather than
  // located, so a hyperlink and a fetched resource pointing at the same host
  // do not cancel each other out.
  const allowed = new Map()
  if (extname(path) === '.html') {
    for (const match of text.matchAll(LINK_ATTRIBUTE)) {
      const href = match[2] ?? match[3] ?? ''
      allowed.set(href, (allowed.get(href) ?? 0) + 1)
    }
  }

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0]
    if (NAMESPACES.some((pattern) => pattern.test(url))) continue
    if (allowed.get(url) > 0) {
      allowed.set(url, allowed.get(url) - 1)
      continue
    }
    const line = text.slice(0, match.index).split('\n').length
    violations.push(`${relative(root, path)}:${line}: external reference ${url}`)
  }
}

if (scanned === 0) {
  console.error(`no text files under ${root} — nothing was checked`)
  process.exit(2)
}
if (violations.length > 0) {
  console.error('zero-CDN check failed (ADR-0045 §5): the site fetches from external hosts:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}
console.log(`zero-CDN check passed: ${scanned} text files, every external URL is a hyperlink`)
