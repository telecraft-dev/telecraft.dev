// What the build has to keep getting right, checked against a fixture
// docs tree that mirrors the shape of docs/nav.yaml in
// telecraft-dev/telecraft.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findExternalReferences } from '../tools/check-external-assets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const fixtureDocs = path.join(here, 'fixtures', 'docs');

let outDir;
const read = (relative) => fs.readFileSync(path.join(outDir, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(outDir, relative));

before(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-site-'));
  execFileSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'build.mjs'), '--docs', fixtureDocs, '--out', outDir, '--strict'],
    { cwd: repoRoot, stdio: 'pipe' },
  );
});

after(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('what gets emitted', () => {
  it('puts the landing page at the root and the documentation under /docs', () => {
    assert.ok(exists('index.html'));
    assert.ok(exists('docs/index.html'));
    assert.ok(exists('docs/concepts/index.html'));
    assert.ok(exists('docs/concepts/shapes.html'));
    assert.ok(exists('docs/guides/quickstart.html'));
    assert.ok(exists('assets/docs.css'));
  });

  // Until this build existed the workflow uploaded the repository root, so
  // everything the site serves was served by accident. Now it is served
  // because it is named, and a file dropping out of the output is a thing a
  // test should notice rather than a thing a reader should.
  it('serves the whole site and not only the documentation', () => {
    for (const file of [
      'index.html',
      'favicon.svg',
      'LICENSE',
      'assets/site.css',
      'assets/docs.css',
      'assets/theme.js',
      'assets/tokens.css',
      'assets/base.css',
      'assets/fonts/fonts.css',
      'assets/fonts/AtkinsonHyperlegibleNext.woff2',
    ]) {
      assert.ok(exists(file), `${file} is missing from the built site`);
    }
  });

  it('generates a section index when the section has no index.md', () => {
    const html = read('docs/guides/index.html');
    assert.match(html, /<h1>Guides<\/h1>/);
    assert.match(html, /Task-oriented instructions\./);
    assert.match(html, /href="quickstart\.html"/);
  });

  it('copies a raw HTML page through untouched', () => {
    const source = fs.readFileSync(path.join(fixtureDocs, 'standalone.html'));
    assert.deepEqual(fs.readFileSync(path.join(outDir, 'docs/standalone.html')), source);
  });

  it('takes a page title from nav.yaml when the page has no front matter', () => {
    assert.match(read('docs/glossary.html'), /<title>Glossary · Fixture documentation<\/title>/);
  });
});

// `index.html` is hand written and every documentation page is generated,
// and a reader following a link between them must not be able to tell. The
// two agree by convention, which is another way of saying they agree until
// somebody edits one of them; these are the assertions that make the
// convention hold.
describe('the landing page and a documentation page are the same site', () => {
  const landing = () => fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const page = () => read('docs/concepts/shapes.html');

  // Character for character, not merely equivalent. `tokens.css` carries
  // dark on the bare :root, so a reader who chose light sees one dark frame
  // if this block does not run before the first stylesheet — and sees a
  // different frame on each of the two pages if the two blocks disagree.
  it('carries the same pre-paint theme resolver, byte for byte', () => {
    const resolver = (html) => {
      const match = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
      assert.ok(match, 'no inline script found');
      return match[1];
    };
    const inlined = resolver(page());
    assert.equal(inlined, resolver(landing()));
    assert.match(inlined, /localStorage\.getItem\('telecraft\.theme'\)/);
    assert.match(inlined, /matchMedia\('\(prefers-color-scheme: light\)'\)/);
    assert.match(inlined, /catch \(error\) \{\s*document\.documentElement\.dataset\.theme = 'dark'/);
  });

  it('resolves the theme before the first stylesheet', () => {
    const html = page();
    assert.ok(
      html.indexOf('telecraft.theme') < html.indexOf('<link rel="stylesheet"'),
      'the resolver runs after a stylesheet, which costs a reader one wrong frame',
    );
  });

  it('loads faces, then values, then elements, then structure', () => {
    const sheets = [...page().matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(sheets, [
      '/assets/fonts/fonts.css',
      '/assets/tokens.css',
      '/assets/base.css',
      '/assets/docs.css',
    ]);
  });

  it('carries the mark, the font preload, and the theme script', () => {
    const html = page();
    assert.match(html, /<html lang="en-GB">/);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    assert.match(
      html,
      /<link rel="preload" href="\/assets\/fonts\/AtkinsonHyperlegibleNext\.woff2" as="font" type="font\/woff2" crossorigin>/,
    );
    assert.match(html, /<script src="\/assets\/theme\.js" defer><\/script>/);
  });

  // Hidden until `theme.js` unhides it: a control that cannot act is worse
  // than no control. The id is what `theme.js` finds it by, and the class is
  // what it unhides, so both are part of the contract.
  it('offers the same three theme states in the same form', () => {
    const html = page();
    assert.match(html, /<label class="theme-control" hidden>/);
    assert.match(html, /<select id="theme-choice">/);
    for (const state of ['system', 'light', 'dark']) {
      assert.match(html, new RegExp(`<option value="${state}">`));
    }
  });

  // telecraft ADR-0050 §6. Apache-2.0 was never granted and saying so was a
  // false statement of the licence, which is the one kind of documentation
  // error that costs somebody something.
  it('names the licence the project actually grants', () => {
    const html = page();
    assert.match(
      html,
      /<a href="https:\/\/github\.com\/telecraft-dev\/telecraft\/blob\/main\/LICENSE">Elastic License 2\.0<\/a>/,
    );
    assert.doesNotMatch(html, /Apache-2\.0/);
  });
});

// ADR-0047 §2: every colour is defined in exactly two blocks, in
// `tokens.css`, and never inside a media query. `docs.css` is structure over
// that, so it reads colours and defines none. A colour minted behind
// `prefers-color-scheme` in particular is stranded in the unresolved state,
// which is the failure the rule exists to prevent.
describe('docs.css reads the design system rather than forking it', () => {
  const stylesheet = () => fs.readFileSync(path.join(repoRoot, 'assets', 'docs.css'), 'utf8');

  it('names no colour of its own', () => {
    const source = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
    const literals = source.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|color-mix|oklch)\(/g);
    assert.deepEqual(literals ?? [], []);
  });

  it('reads its colours from tokens.css', () => {
    const source = stylesheet();
    for (const token of ['--colour-bg', '--colour-text', '--colour-rule', '--colour-chrome']) {
      assert.match(source, new RegExp(`var\\(${token}\\)`), `${token} is never read`);
    }
  });

  it('sets no custom property inside a media query', () => {
    const source = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of source.matchAll(/@media[^{]*\{([\s\S]*?\n\})\s*\n\}/g)) {
      assert.doesNotMatch(block[1], /^\s*--[\w-]+\s*:/m);
    }
  });
});

describe('not_published', () => {
  it('emits nothing from a denied directory or file', () => {
    assert.equal(exists('docs/adr/0001-a-decision.html'), false);
    assert.equal(exists('docs/adr'), false);
    assert.equal(exists('docs/secret.html'), false);
  });

  it('sends links into the working corpus to the source repository instead', () => {
    assert.match(
      read('docs/concepts/shapes.html'),
      /href="https:\/\/example\.invalid\/org\/repo\/blob\/main\/docs\/adr\/0001-a-decision\.md"/,
    );
  });

  it('fails the build when nav.yaml publishes a denied path', () => {
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-docs-'));
    fs.cpSync(fixtureDocs, broken, { recursive: true });
    const nav = fs.readFileSync(path.join(broken, 'nav.yaml'), 'utf8');
    fs.writeFileSync(
      path.join(broken, 'nav.yaml'),
      nav.replace('  - path: glossary.md', '  - path: secret.md\n    title: Leak\n  - path: glossary.md'),
    );

    const result = runBuild(broken);
    assert.equal(result.status, 1);
    assert.match(result.output, /not_published/);
    fs.rmSync(broken, { recursive: true, force: true });
  });
});

describe('links between pages', () => {
  it('resolves a relative link across sections to the published URL', () => {
    assert.match(read('docs/concepts/shapes.html'), /href="\.\.\/guides\/quickstart\.html"/);
  });

  it('keeps the fragment on a link that carries one', () => {
    assert.match(read('docs/guides/quickstart.html'), /href="\.\.\/concepts\/shapes\.html#a-table"/);
  });

  it('links down into a section from the documentation home', () => {
    assert.match(read('docs/index.html'), /href="guides\/quickstart\.html"/);
  });

  // `read [the guides](../guides/)` is how the prose refers to a section
  // rather than to a page. Left alone it depends on the host serving a
  // directory index, which is the one thing every other link in the output
  // does not depend on.
  it('sends a link to a section directory to that section index', () => {
    assert.match(read('docs/concepts/shapes.html'), /href="\.\.\/guides\/index\.html"/);
  });
});

// A documentation corpus is largely made of URLs written down, and none of
// them is a request the page makes. The check has to tell the difference or
// it fails on every guide that begins `git clone`.
describe('a URL in prose is not a request', () => {
  it('publishes an address in a code span and still passes the check', async () => {
    assert.match(read('docs/concepts/shapes.html'), /https:\/\/example\.invalid\/repo\.git/);
    const { violations } = await findExternalReferences(outDir);
    assert.deepEqual(violations, []);
  });
});

// telecraft.dev does not own telecraft's documentation and cannot fix it in
// place. One page whose front matter a YAML parser rejects — an unquoted
// value with a colon in it is the usual way — must not take the site down.
describe('a page whose front matter will not parse', () => {
  let broken;
  before(() => {
    broken = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-docs-'));
    fs.cpSync(fixtureDocs, broken, { recursive: true });
    fs.writeFileSync(
      path.join(broken, 'concepts', 'shapes.md'),
      '---\ndescription: Shapes: tables, lists, and code.\n---\n\n# Shapes\n\nStill here.\n',
    );
  });

  after(() => fs.rmSync(broken, { recursive: true, force: true }));

  it('publishes the page, warns, and takes its title from nav.yaml', () => {
    const result = runBuild(broken);
    assert.equal(result.status, 0);
    assert.match(result.output, /not valid YAML/);
    const html = fs.readFileSync(path.join(result.out, 'docs/concepts/shapes.html'), 'utf8');
    assert.match(html, /Still here\./);
    assert.doesNotMatch(html, /Shapes: tables, lists, and code\./);
    fs.rmSync(result.out, { recursive: true, force: true });
  });

  it('fails under --strict, which is what --strict is for', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-out-'));
    const result = runBuild(broken, out, ['--strict']);
    assert.equal(result.status, 1);
    fs.rmSync(out, { recursive: true, force: true });
  });
});

describe('rendering', () => {
  it('renders tables, description lists, and highlighted code', () => {
    const html = read('docs/concepts/shapes.html');
    assert.match(html, /<div class="table-scroll">\s*<table>/);
    assert.match(html, /<dt>Reading<\/dt>/);
    assert.match(html, /<pre class="code"><code class="hljs language-yaml">/);
    assert.match(html, /<span class="hljs-attr">/);
  });

  it('gives every heading an anchor and builds a table of contents', () => {
    const html = read('docs/concepts/shapes.html');
    assert.match(html, /<h2 id="a-table">/);
    assert.match(html, /aria-label="On this page"/);
    assert.match(html, /href="#a-description-list"/);
  });

  it('derives the sidebar from nav.yaml, in nav.yaml order', () => {
    const html = read('docs/guides/quickstart.html');
    const start = html.indexOf('<nav class="sidebar"');
    const sidebar = html.slice(start, html.indexOf('</nav>', start));
    const order = [...sidebar.matchAll(/>([^<>]+)<\/a>/g)].map((match) => match[1]);
    assert.deepEqual(order, [
      'Overview',
      'Concepts',
      'Shapes',
      'Glossary',
      'Standalone page',
      'Guides',
      'Quickstart',
    ]);
  });
});

describe('no external requests', () => {
  it('passes on the built site', async () => {
    const { scanned, violations } = await findExternalReferences(outDir);
    assert.deepEqual(violations, []);
    assert.ok(scanned > 0, 'the check found nothing to read in the built site');
  });

  it('catches a remote script, stylesheet, font, or image', async () => {
    const planted = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-check-'));
    fs.writeFileSync(
      path.join(planted, 'page.html'),
      `<a href="https://example.invalid/fine">a link is fine</a>
       <script src="https://cdn.example.invalid/x.js"></script>
       <link rel="stylesheet" href="//fonts.example.invalid/css">
       <img src="https://img.example.invalid/a.png">
       <style>@font-face { src: url(https://fonts.example.invalid/a.woff2); }</style>`,
    );
    const { violations } = await findExternalReferences(planted);
    assert.equal(violations.length, 4);
    assert.equal(
      violations.some((violation) => violation.url.includes('example.invalid/fine')),
      false,
    );
    fs.rmSync(planted, { recursive: true, force: true });
  });
});

describe('a docs checkout that is not there', () => {
  it('still publishes the landing page rather than taking the site down', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-empty-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-out-'));
    const result = runBuild(empty, target);
    assert.equal(result.status, 0);
    assert.ok(fs.existsSync(path.join(target, 'index.html')));
    fs.rmSync(empty, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  });
});

// Both streams, always: the build reports pages on stdout and warnings on
// stderr, and a test about a warning has to be able to see one whether or not
// the build went on to succeed.
function runBuild(docs, out = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-out-')), extra = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'build.mjs'), '--docs', docs, '--out', out, ...extra],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    out,
  };
}
