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
//   --skip-check  do not run the external-host check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, isNotPublished, outputPathFor } from './lib/nav.mjs';
import { createRenderer } from './lib/markdown.mjs';
import { renderPage, escapeHtml } from './lib/layout.mjs';
import { checkNoExternal } from './check-no-external.mjs';

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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    console.warn(`warning: ${message}`);
  };

  fs.rmSync(options.out, { recursive: true, force: true });
  fs.mkdirSync(options.out, { recursive: true });

  copySiteShell(options.out);

  const navPath = path.join(options.docs, 'nav.yaml');
  if (!fs.existsSync(navPath)) {
    // The documentation has not landed in telecraft yet, or the checkout
    // failed. Publish the landing page rather than taking the site down.
    warn(`no nav.yaml at ${navPath}; built the landing page only`);
    finish(options, warnings, 0);
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

  finish(options, warnings, written.length);
}

/** Copy the landing page and the site-level assets into the output. */
function copySiteShell(outDir) {
  fs.copyFileSync(path.join(repoRoot, 'index.html'), path.join(outDir, 'index.html'));
  const assets = path.join(repoRoot, 'assets');
  if (fs.existsSync(assets)) {
    fs.cpSync(assets, path.join(outDir, 'assets'), { recursive: true });
  }
  const cname = path.join(repoRoot, 'CNAME');
  if (fs.existsSync(cname)) fs.copyFileSync(cname, path.join(outDir, 'CNAME'));
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

function finish(options, warnings, pageCount) {
  if (options.check) {
    const offenders = checkNoExternal(options.out);
    if (offenders.length > 0) {
      const lines = offenders.map((o) => `  ${o.file}: ${o.match}`).join('\n');
      throw new Error(`the built site would make external requests:\n${lines}`);
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
  main();
} catch (error) {
  console.error(`build failed: ${error.message}`);
  process.exitCode = 1;
}
