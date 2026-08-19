#!/usr/bin/env node
// Prove the built site makes no external requests.
//
// Telecraft ships nothing that phones a CDN, and the site that documents
// it holds to the same rule: no remote scripts, stylesheets, fonts,
// images, or analytics. Everything a page needs is served from the site.
//
// Links a reader clicks are not requests the page makes, so `<a href>` to
// another site is fine. Anything the browser fetches on its own is not.
//
//   node scripts/check-no-external.mjs _site

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTE = /^(?:https?:|wss?:|ftp:)?\/\//i;

// Attributes the browser fetches without being asked.
const FETCHING_ATTRIBUTES = ['src', 'srcset', 'href', 'data', 'poster', 'xlink:href', 'formaction'];

// Elements whose fetching attributes count. `a` and `area` are absent on
// purpose: those are navigation, not a request the page makes.
const FETCHING_ELEMENTS =
  /<(script|link|img|source|video|audio|iframe|embed|object|track|input|use|image|frame|portal)\b([^>]*)>/gi;

const ATTRIBUTE = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

const OTHER_PATTERNS = [
  { name: 'css url()', pattern: /url\(\s*['"]?([^'")\s]+)/gi },
  { name: '@import', pattern: /@import\s+(?:url\()?\s*['"]([^'"]+)/gi },
  { name: 'fetch()', pattern: /\bfetch\s*\(\s*['"`]([^'"`]+)/gi },
  { name: 'WebSocket', pattern: /new\s+WebSocket\s*\(\s*['"`]([^'"`]+)/gi },
  { name: 'importScripts', pattern: /\bimportScripts\s*\(\s*['"`]([^'"`]+)/gi },
  { name: 'XMLHttpRequest', pattern: /\.open\s*\(\s*['"`][A-Z]+['"`]\s*,\s*['"`]([^'"`]+)/gi },
];

const SCANNED = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.svg', '.xml', '.json']);

/**
 * @param {string} root Directory to scan.
 * @returns {Array<{file: string, match: string}>} Empty when the site is clean.
 */
export function checkNoExternal(root) {
  const offenders = [];
  for (const file of walk(root)) {
    if (!SCANNED.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');

    for (const tag of source.matchAll(FETCHING_ELEMENTS)) {
      const [, element, attributes] = tag;
      for (const attribute of attributes.matchAll(ATTRIBUTE)) {
        const name = attribute[1].toLowerCase();
        if (!FETCHING_ATTRIBUTES.includes(name)) continue;
        const value = attribute[3] ?? attribute[4] ?? attribute[5] ?? '';
        for (const candidate of value.split(',')) {
          const url = candidate.trim().split(/\s+/)[0];
          if (REMOTE.test(url)) {
            offenders.push({ file: relative, match: `<${element} ${name}="${url}">` });
          }
        }
      }
    }

    for (const { name, pattern } of OTHER_PATTERNS) {
      for (const found of source.matchAll(pattern)) {
        if (REMOTE.test(found[1])) {
          offenders.push({ file: relative, match: `${name} ${found[1]}` });
        }
      }
    }
  }
  return offenders;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const root = path.resolve(process.argv[2] ?? '_site');
  if (!fs.existsSync(root)) {
    console.error(`nothing to check: ${root} does not exist`);
    process.exit(1);
  }
  const offenders = checkNoExternal(root);
  if (offenders.length > 0) {
    console.error('the built site would make external requests:');
    for (const offender of offenders) console.error(`  ${offender.file}: ${offender.match}`);
    process.exit(1);
  }
  console.log(`no external requests in ${path.relative(process.cwd(), root) || root}/`);
}
