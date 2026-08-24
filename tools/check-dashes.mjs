// No dash used as punctuation, anywhere in this repository.
//
// The house style telecraft-dev/telecraft writes down is the Google developer
// documentation style guide with two overrides, and one of them is that an em
// or en dash is never punctuation: use a comma, brackets, a colon, or a new
// sentence, and write ranges with "to". That repository enforces it over its
// whole tree. This one had no such check, so 81 of them accumulated, and the
// most visible sat in the `<title>` of the front door, which is the text a
// browser prints on the tab.
//
// The rule covers the whole repository rather than the published pages alone.
// A comment is prose somebody reads, and a dash in one is a dash the next
// person copies into something a reader sees.
//
// Vendored files are exempt: they are byte-for-byte copies of another
// repository's source, `tools/vendor.mjs check` is what holds them honest,
// and rewriting one here would be the fork that check exists to prevent. The
// upstream repository runs this same rule over them.
//
// Usage: node tools/check-dashes.mjs

import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Em dash and en dash. Both are punctuation here, and neither is allowed.
 *
 * Written as escapes rather than as the characters themselves, because this
 * file is checked by this rule like every other, and a literal pair here
 * makes the checker fail on itself. It did, on the first run in CI: the copy
 * on disk was untracked when it ran locally, so `git ls-files` did not hand
 * it to itself, and committing it was what made the check see it.
 */
const DASHES = /[\u2014\u2013]/

/** Files this repository does not author, held honest by the vendor check. */
async function exempt() {
  const manifest = JSON.parse(await readFile(join(root, 'tools/vendored.json'), 'utf8'))
  return new Set(manifest.files.map((file) => file.to))
}

/** Every tracked file, which is the honest definition of "this repository". */
function tracked() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

const vendored = await exempt()
const problems = []

for (const path of tracked()) {
  if (vendored.has(path)) continue
  let bytes
  try {
    bytes = await readFile(join(root, path))
  } catch {
    continue
  }
  // A NUL byte is the classic tell that a file is not text. Fonts, images and
  // the .ico all carry one; no source file in this repository does. They have
  // no prose to check, and their bytes are not ours to rewrite.
  if (bytes.includes(0)) continue
  const text = bytes.toString('utf8')

  text.split('\n').forEach((line, index) => {
    if (DASHES.test(line)) problems.push(`${path}:${index + 1}: ${line.trim()}`)
  })
}

if (problems.length > 0) {
  const count = problems.length
  console.error(`dash check failed: ${count} dash${count === 1 ? '' : 'es'} used as punctuation.`)
  console.error('Use a comma, brackets, a colon, or a new sentence; write ranges with "to".\n')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`dash check passed: no dash used as punctuation (${vendored.size} vendored files exempt)`)
