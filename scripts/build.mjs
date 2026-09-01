#!/usr/bin/env node
// Build telecraft.dev into _site/.
//
// The landing page is this repository's. The documentation is not: it
// lives in telecraft-dev/telecraft under docs/, and docs/nav.yaml is the
// contract that says what gets published and in what order. Point this
// script at a checkout of that directory.
//
//   node scripts/build.mjs --docs ../telecraft/docs
//
// Options:
//   --docs DIR    the checked-out docs directory (default: telecraft/docs)
//   --out DIR     where to write the site (default: _site)
//   --strict      treat warnings as errors
//   --skip-check  do not run the zero-CDN check over the output

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, isNotPublished, outputPathFor } from './lib/nav.mjs';
import { createRenderer } from './lib/markdown.mjs';
import { renderPage, escapeHtml } from './lib/layout.mjs';
import { createHash } from 'node:crypto';
import { findExternalReferences, formatViolation } from '../tools/check-external-assets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {
    docs: process.env.TELECRAFT_DOCS ?? path.join(repoRoot, 'telecraft', 'docs'),
    out: path.join(repoRoot, '_site'),
    strict: false,
    check: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--docs') options.docs = path.resolve(argv[++i]);
    else if (arg === '--out') options.out = path.resolve(argv[++i]);
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--skip-check') options.check = false;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    console.warn(`warning: ${message}`);
  };

  fs.rmSync(options.out, { recursive: true, force: true });
  fs.mkdirSync(options.out, { recursive: true });

  copySiteShell(options.out, warn);

  const navPath = path.join(options.docs, 'nav.yaml');
  if (!fs.existsSync(navPath)) {
    // The documentation has not landed in telecraft yet, or the checkout
    // failed. Publish the landing page rather than taking the site down.
    warn(`no nav.yaml at ${navPath}; built the landing page only`);
    await finish(options, warnings, 0);
    return;
  }

  const model = buildModel(options.docs, warn);
  const written = [];

  for (const page of model.pages.values()) {
    const destination = path.join(options.out, page.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    if (page.format === 'copy') {
      // terminology.html is a finished, self-contained document. It goes
      // through byte for byte.
      fs.copyFileSync(path.join(options.docs, page.source), destination);
    } else {
      const renderer = createRenderer({ page, model, warn });
      const content = renderer.render(page.body);
      fs.writeFileSync(
        destination,
        renderPage({
          model,
          output: page.output,
          title: page.title,
          description: page.description,
          content,
          headings: renderer.headings,
          sourcePath: page.source,
        }),
      );
    }
    written.push({ output: page.output, source: page.source });
  }

  for (const section of model.sections) {
    if (!section.generatedIndex) continue;
    const destination = path.join(options.out, section.generatedIndex.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(
      destination,
      renderPage({
        model,
        output: section.generatedIndex.output,
        title: section.title,
        description: oneLine(section.summary),
        content: sectionIndexBody(section),
        sourcePath: null,
      }),
    );
    written.push({ output: section.generatedIndex.output, source: null });
  }

  assertNotPublished({ model, options, written });

  await finish(options, warnings, written.length);
}

/**
 * Everything the site serves that is not a documentation page: this
 * repository's own files, copied to the root of the output.
 *
 * The list is exhaustive on purpose. Until this build existed the workflow
 * uploaded the repository root, so every file here was served whether or not
 * anyone meant it to be; now nothing is served unless it is named below, and
 * a file that stops being served stops silently. Hence the list, and hence
 * the fact that the icons and `LICENSE` are on it: every icon is asked for
 * by name in the head of every page, and `/LICENSE` is a URL the site has
 * already been answering.
 *
 * The icon set is five files because one is not enough. Safari has not
 * reliably drawn an SVG favicon, and a browser that falls back asks for
 * `/favicon.ico`, which a static host answers with a 404. `index.html` names
 * all five, and `test/build.test.mjs` checks that every icon the head asks
 * for actually reaches the output, which is the failure this list invites.
 *
 * `CNAME` is optional because the custom domain is presently held in the
 * repository's Pages settings rather than in a file. If one is ever added it
 * has to reach the output, or the first deploy after it drops the domain.
 */
const SITE_FILES = [
  'index.html',
  'favicon.svg',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'LICENSE',
  'CNAME',
];

function copySiteShell(outDir, warn) {
  for (const name of SITE_FILES) {
    const source = path.join(repoRoot, name);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(outDir, name));
    } else if (name !== 'CNAME') {
      warn(`${name} is not in this repository; the site will be served without it`);
    }
  }

  const assets = path.join(repoRoot, 'assets');
  if (fs.existsSync(assets)) {
    fs.cpSync(assets, path.join(outDir, 'assets'), { recursive: true });
  } else {
    warn('assets/ is not in this repository; every page will be served unstyled');
  }
}

function sectionIndexBody(section) {
  const cards = section.pages
    .map(
      (page) =>
        `        <li><a href="${escapeHtml(path.posix.basename(page.output))}"><strong>${escapeHtml(page.title)}</strong><span>${escapeHtml(page.description ?? '')}</span></a></li>`,
    )
    .join('\n');
  return `<h1>${escapeHtml(section.title)}</h1>
<p>${escapeHtml(oneLine(section.summary))}</p>
<ul class="cards">
${cards}
</ul>`;
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The `not_published` list is absolute. Prove it twice: nothing written
 * came from a denied path, and no denied path has an output file.
 */
function assertNotPublished({ model, options, written }) {
  const failures = [];

  for (const entry of written) {
    if (entry.source && isNotPublished(entry.source, model.notPublished)) {
      failures.push(`${entry.source} is in not_published but was rendered to ${entry.output}`);
    }
  }

  for (const source of walk(options.docs)) {
    if (!isNotPublished(source, model.notPublished)) continue;
    const wouldBe = path.posix.join(model.basePath.slice(1), outputPathFor(source));
    if (fs.existsSync(path.join(options.out, wouldBe))) {
      failures.push(`${source} is in not_published but ${wouldBe} exists in the output`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`not_published was violated:\n  ${failures.join('\n  ')}`);
  }
}

function* walk(dir, prefix = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), relative);
    else yield relative;
  }
}

/**
 * Every stylesheet and script carries a stamp of its own contents.
 *
 * Pages serves a page with `max-age=600` and everything under `/assets/` with
 * `max-age=14400`. A page therefore comes back new while the stylesheet it was
 * written against is still four hours old, and for those four hours a reader
 * holds markup that its rules have never seen. That is not a worry, it is what
 * happened: a topbar shipped drawn by a sheet that did not know what was in
 * it.
 *
 * Naming a file by what is in it settles it. Change the file and the URL
 * changes with it, so no cache can already hold an answer for it; change
 * nothing and the stamp is the same, so a reader keeps the copy they have.
 * The stamp is a query rather than a new filename because the file on disk
 * stays the one the repository names, which is what every other check here
 * looks for.
 *
 * Faces are left alone. They are asked for from inside `fonts.css` rather than
 * from a page, they are vendored at a version, and a face that arrives one
 * deploy late is a face nobody sees arrive.
 */
function stampAssets(outDir) {
  const assets = path.join(outDir, 'assets');
  if (!fs.existsSync(assets)) return;

  const stamps = new Map();
  for (const relative of walk(assets)) {
    if (!/\.(?:css|js)$/.test(relative)) continue;
    const body = fs.readFileSync(path.join(assets, relative));
    stamps.set(`/assets/${relative}`, createHash('sha256').update(body).digest('hex').slice(0, 12));
  }
  if (stamps.size === 0) return;

  const reference = /(href|src)="(\/assets\/[^"?#]+\.(?:css|js))"/g;
  for (const relative of walk(outDir)) {
    if (!relative.endsWith('.html')) continue;
    const file = path.join(outDir, relative);
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(reference, (whole, attribute, url) => {
      const stamp = stamps.get(url);
      return stamp ? `${attribute}="${url}?v=${stamp}"` : whole;
    });
    if (after !== before) fs.writeFileSync(file, after);
  }
}

async function finish(options, warnings, pageCount) {
  // Before the check below, because what it reads has to be what deploys.
  stampAssets(options.out);

  // The same check CI runs over the source tree, run here over what will
  // actually be deployed. This is the pass that matters: most of `_site/` was
  // written in another repository and arrives through `nav.yaml`, so the
  // source pass cannot see it.
  if (options.check) {
    const { violations } = await findExternalReferences(options.out);
    if (violations.length > 0) {
      const lines = violations.map((violation) => `  ${formatViolation(violation)}`).join('\n');
      throw new Error(`the built site would fetch from external hosts:\n${lines}`);
    }
  }

  const relativeOut = path.relative(process.cwd(), options.out) || options.out;
  console.log(`built ${pageCount} documentation page(s) into ${relativeOut}/`);
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s)`);
    if (options.strict) throw new Error('--strict was given and the build produced warnings');
  }
}

try {
  await main();
} catch (error) {
  console.error(`build failed: ${error.message}`);
  process.exitCode = 1;
}
