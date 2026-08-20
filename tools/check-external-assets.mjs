// The zero-CDN rule, applied to telecraft.dev (ADR-0019, ADR-0045 §5).
//
// Nothing this site serves may be fetched from another origin: no font CDN,
// no analytics tag, no hosted stylesheet. The console enforces this with
// `console/tools/check-zero-cdn.mjs`, which tolerates no external URL in HTML
// at all — it can afford that, because a console has no reason to link out.
//
// A front door does, and a documentation site does far more of it: every
// "Edit this page on GitHub", every link into the working corpus that
// `nav.yaml` marks `not_published`, every citation in the prose. All of those
// are hyperlinks: places the reader may choose to go, not resources the
// browser fetches on their behalf, and the rule was never about where a
// reader is allowed to click. So this check draws the line where the rule
// actually is — at sub-resources. An external URL is a failure everywhere
// except as the `href` of an `<a>` or an `<area>`, and in CSS wherever
// `url()` or `@import` can reach.
//
// Inside a markup tag it is deny-by-default, which is the point: it holds no
// list of elements or attributes a browser might fetch from, so `<meta
// http-equiv="refresh" content="0;url=…">`, `<base href>`, an inline
// `style="background:url(…)"` and whatever the next specification invents are
// all failures rather than omissions.
//
// What it does not read is the text between the tags, and that is a line
// about mechanism rather than a concession. A URL a browser fetches can only
// occupy three positions in a document: an attribute value, the body of a
// `<script>`, or the body of a `<style>`. A URL in a text node is a URL
// somebody wrote down. That distinction did not matter while this site was
// one hand-written page; it is load-bearing now, because a documentation
// corpus is largely made of URLs written down — `git clone https://…`, an
// OTLP endpoint in a YAML listing, a release archive in a table — and every
// one of them is prose that happens to be shaped like an address.
//
// XML namespace identifiers are the one exception: `xmlns` is a name, not an
// address, and no parser has ever dereferenced one. An SVG cannot be authored
// without it.
//
// Two things get checked, and they are not the same thing. The source tree,
// on every pull request, because that is where a mistake is cheap to fix; and
// `_site/` at the end of every build, because that is what readers are
// actually served and it contains pages nobody in this repository wrote.
//
//   node tools/check-external-assets.mjs          the source tree
//   node tools/check-external-assets.mjs _site    what will be deployed

import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// Every file type a browser can be made to fetch something from. Plain text
// is absent on purpose: the two OFL licences name the foundries' URLs in
// their prose, and prose causes no fetch. Markdown is absent for the same
// reason — nothing here renders it.
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.webmanifest'])

// Build machinery, and nothing else. Every one of these reaches other hosts
// by design — `tools/` fetches the vendored design system from GitHub, the
// test suite plants remote scripts on purpose to prove they are caught, and
// `package-lock.json` is a registry manifest — and not one byte of any of
// them is copied into `_site/`. That is the whole justification: the source
// pass may skip them precisely because the `_site/` pass cannot, and the
// `_site/` pass is the authoritative one.
//
// Matched against the path relative to the scan root, not against the bare
// name, so a documentation section that happens to be called `tools` or
// `scripts` is still checked.
const SKIP = new Set([
  '.git',
  '.github',
  'node_modules',
  'tools',
  'scripts',
  'test',
  'package-lock.json',
])

const NAMESPACES = [/^https?:\/\/www\.w3\.org\//]
const URL_PATTERN = /(?:https?:)?\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?![a-z0-9.-])[^\s"'`)<>\\]*/gi

// `<a href>` and `<area href>` — the two attributes that name somewhere the
// reader may go rather than something the browser will fetch.
const LINK_ATTRIBUTE = /<(a|area)\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

const EXECUTABLE = new Set(['script', 'style'])

/**
 * The regions of an HTML document a browser can be made to fetch from: every
 * tag and comment, and the body of every `<script>` and `<style>`. Everything
 * else is text somebody wrote for somebody to read.
 *
 * Scanned rather than matched with a regular expression, and the reason is
 * worth writing down because the regular expression was tried first and was
 * wrong in a way that took a real corpus to expose. A quotation mark means
 * "attribute value" inside a tag and means nothing at all inside a comment,
 * so a pattern that treats them alike swallows the apostrophe in a comment
 * like `the console's` and runs on to the next one — in practice several
 * thousand characters later, taking half the document into the region with
 * it. Comments are therefore recognised before tags, and quoting is only
 * honoured where quoting exists.
 *
 * A comment is a region on purpose. Nothing in one is fetched, but a
 * commented-out CDN tag is a tag somebody is one keystroke from restoring.
 *
 * @param {string} html
 * @returns {Array<[number, number]>} Half-open [start, end) offsets, in order.
 */
function fetchableRegions(html) {
  const regions = []
  let i = 0

  while (i < html.length) {
    const open = html.indexOf('<', i)
    if (open === -1) break

    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4)
      const end = close === -1 ? html.length : close + 3
      regions.push([open, end])
      i = end
      continue
    }

    if (!/[a-zA-Z!/]/.test(html[open + 1] ?? '')) {
      i = open + 1
      continue
    }

    // To the `>` that closes the tag, with a `>` inside a quoted attribute
    // value counted as part of the value.
    let j = open + 1
    let quote = null
    while (j < html.length) {
      const character = html[j]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
      j += 1
    }
    const end = Math.min(j + 1, html.length)
    regions.push([open, end])
    i = end

    const name = (html.slice(open + 1, end).match(/^[a-zA-Z][a-zA-Z0-9-]*/) ?? [''])[0].toLowerCase()
    if (EXECUTABLE.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, end)
      const bodyEnd = close === -1 ? html.length : close
      if (bodyEnd > end) regions.push([end, bodyEnd])
      i = bodyEnd
    }
  }

  return regions
}

function within(regions, index) {
  return regions.some(([start, end]) => index >= start && index < end)
}

async function* walk(root, dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (SKIP.has(relative(root, path).split(sep).join('/'))) continue
    if (entry.isDirectory()) yield* walk(root, path)
    else yield path
  }
}

/**
 * Every external reference under `root` that is not a hyperlink.
 *
 * @param {string} root Directory to scan.
 * @returns {Promise<{scanned: number, violations: Array<{file: string, line: number, url: string}>}>}
 */
export async function findExternalReferences(root) {
  let scanned = 0
  const violations = []

  for await (const path of walk(root, root)) {
    if (!TEXT_EXTENSIONS.has(extname(path))) continue
    scanned++
    const text = await readFile(path, 'utf8')

    // Every URL that is the destination of a hyperlink. Counted rather than
    // located, so a hyperlink and a fetched resource pointing at the same
    // host do not cancel each other out.
    const allowed = new Map()
    // In HTML, only tags and executable bodies are read. Every other file
    // type here — CSS, JavaScript, SVG, JSON — is fetchable throughout, so
    // `regions` stays null and nothing is skipped.
    let regions = null
    if (extname(path) === '.html') {
      regions = fetchableRegions(text)
      for (const match of text.matchAll(LINK_ATTRIBUTE)) {
        const href = match[2] ?? match[3] ?? ''
        allowed.set(href, (allowed.get(href) ?? 0) + 1)
      }
    }

    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0]
      if (regions && !within(regions, match.index)) continue
      if (NAMESPACES.some((pattern) => pattern.test(url))) continue
      if (allowed.get(url) > 0) {
        allowed.set(url, allowed.get(url) - 1)
        continue
      }
      violations.push({
        file: relative(root, path),
        line: text.slice(0, match.index).split('\n').length,
        url,
      })
    }
  }

  return { scanned, violations }
}

/** One violation, as a line a human can paste into an editor. */
export function formatViolation({ file, line, url }) {
  return `${file}:${line}: external reference ${url}`
}

const invokedDirectly =
  process.argv[1] && resolveSame(process.argv[1], fileURLToPath(import.meta.url))

function resolveSame(a, b) {
  return relative(a, b) === ''
}

if (invokedDirectly) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  const { scanned, violations } = await findExternalReferences(root)

  if (scanned === 0) {
    console.error(`no text files under ${root} — nothing was checked`)
    process.exit(2)
  }
  if (violations.length > 0) {
    console.error('zero-CDN check failed (ADR-0045 §5): the site fetches from external hosts:')
    for (const violation of violations) console.error(`  ${formatViolation(violation)}`)
    process.exit(1)
  }
  console.log(`zero-CDN check passed: ${scanned} text files, every external URL is a hyperlink`)
}
