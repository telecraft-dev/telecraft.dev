// What the build has to keep getting right, checked against a fixture
// docs tree that mirrors the shape of docs/nav.yaml in
// telecraft-dev/telecraft.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkNoExternal } from '../scripts/check-no-external.mjs';

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
  it('passes on the built site', () => {
    assert.deepEqual(checkNoExternal(outDir), []);
  });

  it('catches a remote script, stylesheet, font, or image', () => {
    const planted = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-check-'));
    fs.writeFileSync(
      path.join(planted, 'page.html'),
      `<a href="https://example.invalid/fine">a link is fine</a>
       <script src="https://cdn.example.invalid/x.js"></script>
       <link rel="stylesheet" href="//fonts.example.invalid/css">
       <img src="https://img.example.invalid/a.png">
       <style>@font-face { src: url(https://fonts.example.invalid/a.woff2); }</style>`,
    );
    const offenders = checkNoExternal(planted);
    assert.equal(offenders.length, 4);
    assert.equal(
      offenders.some((offender) => offender.match.includes('example.invalid/fine')),
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

function runBuild(docs, out = fs.mkdtempSync(path.join(os.tmpdir(), 'telecraft-out-'))) {
  try {
    const output = execFileSync(
      process.execPath,
      [path.join(repoRoot, 'scripts', 'build.mjs'), '--docs', docs, '--out', out],
      { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' },
    );
    return { status: 0, output, out };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}`, out };
  }
}
