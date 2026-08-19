// The page shell: header, sidebar, table of contents, footer.
//
// The sidebar is derived from the navigation model, which is derived
// from nav.yaml. There is no second copy of the navigation here.

import path from 'node:path';
import { relativeTo } from './markdown.mjs';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render one documentation page.
 *
 * @param {object} options
 * @param {object} options.model Site model from nav.mjs.
 * @param {string} options.output Path of this page inside `_site`.
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} options.content Rendered page body.
 * @param {Array}  options.headings Headings for the table of contents.
 * @param {string|null} options.sourcePath Docs-relative source, for the
 *   "edit this page" link. Null for pages the build generates.
 * @param {string|null} options.activeUrl Which nav entry to mark current.
 */
export function renderPage({
  model,
  output,
  title,
  description,
  content,
  headings = [],
  sourcePath = null,
  activeUrl = null,
}) {
  const href = (target) => escapeHtml(relativeTo(output, target));
  const current = activeUrl ?? `/${output}`;
  const siteTitle = model.site.title ?? 'Documentation';
  const docsHome = model.standalone.find((page) => page.source === 'index.md');
  const docsHomeOutput = docsHome ? docsHome.output : `${model.basePath.slice(1)}/index.html`;

  const sidebar = renderSidebar({ model, output, current, docsHomeOutput });
  const toc = renderToc(headings);

  const repo = String(model.site.repository ?? '').replace(/\/+$/, '');
  const editPath = String(model.site.edit_path ?? 'docs').replace(/^\/+|\/+$/g, '');
  const editLink =
    repo && sourcePath
      ? `<a href="${escapeHtml(`${repo}/blob/main/${path.posix.join(editPath, sourcePath)}`)}" rel="noopener">Edit this page on GitHub</a>`
      : '';

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title === siteTitle ? title : `${title} · ${siteTitle}`)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">\n` : ''}<link rel="stylesheet" href="${href('assets/docs.css')}">
</head>
<body class="docs">
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <a class="wordmark" href="${href('index.html')}"><span class="tele">Tele</span>craft</a>
  <nav class="topnav" aria-label="Site">
    <a href="${href(docsHomeOutput)}"${current === `/${docsHomeOutput}` ? ' aria-current="page"' : ''}>Documentation</a>
    <a href="${escapeHtml(repo || 'https://github.com/telecraft-dev/telecraft')}" rel="noopener">GitHub</a>
  </nav>
</header>
<div class="shell">
${sidebar}
  <main id="content" class="page">
    <article class="prose">
${content}
    </article>
    <footer class="pagefoot">
      ${editLink}
      <p>Apache-2.0 · © 2026 the Telecraft project</p>
    </footer>
  </main>
${toc}
</div>
</body>
</html>
`;
}

function renderSidebar({ model, output, current, docsHomeOutput }) {
  const href = (target) => escapeHtml(relativeTo(output, target));
  const link = (target, text) =>
    `<a href="${href(target)}"${current === `/${target}` ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a>`;

  const groups = model.sections.map((section) => {
    const indexOutput = section.index ? section.index.output : section.generatedIndex?.output;
    const heading = indexOutput
      ? `<h2 class="navgroup">${link(indexOutput, section.title)}</h2>`
      : `<h2 class="navgroup"><span>${escapeHtml(section.title)}</span></h2>`;
    if (section.pages.length === 0) return `      ${heading}`;
    const items = section.pages
      .map((page) => `        <li>${link(page.output, page.title)}</li>`)
      .join('\n');
    return `      ${heading}
      <ul>
${items}
      </ul>`;
  });

  const extras = model.standalone
    .filter((page) => page.source !== 'index.md')
    .map((page) => `        <li>${link(page.output, page.title)}</li>`)
    .join('\n');

  return `  <nav class="sidebar" aria-label="Documentation">
      <h2 class="navgroup">${link(docsHomeOutput, 'Overview')}</h2>
${groups.join('\n')}
${extras ? `      <h2 class="navgroup"><span>More</span></h2>\n      <ul>\n${extras}\n      </ul>\n` : ''}  </nav>`;
}

function renderToc(headings) {
  if (headings.length < 2) return '  <div class="toc" aria-hidden="true"></div>';
  const items = headings
    .map(
      (heading) =>
        `      <li class="toc-h${heading.level}"><a href="#${escapeHtml(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join('\n');
  return `  <nav class="toc" aria-label="On this page">
    <h2>On this page</h2>
    <ul>
${items}
    </ul>
  </nav>`;
}
