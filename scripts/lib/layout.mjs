// The page shell: head, top bar, sidebar, table of contents, footer.
//
// The sidebar is derived from the navigation model, which is derived
// from nav.yaml. There is no second copy of the navigation here.
//
// The head below is the landing page's, reproduced. `index.html` and this
// file are the two documents on telecraft.dev, and a reader who follows a
// link from one to the other must not be able to tell that the pages were
// built by different means: same resolver, same mark, same faces, same
// three sheets in the same order, same theme control in the same corner.
// The only thing that differs is the fourth stylesheet, `site.css` there and
// `docs.css` here, which is the seam ADR-0047 §1 put the split at.

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
 * Everything in the head that is the same on every page of the site,
 * documentation or not.
 *
 * The paths are absolute rather than relative, which is the one place this
 * generator departs from its own rule of relative-everything. Two reasons,
 * and they are both about the assets rather than about the pages.
 * telecraft.dev is a custom domain, so the deployed base path is `/` and an
 * absolute asset path resolves correctly at every depth of `/docs`. And an
 * absolute path is the same string on the landing page and on every
 * documentation page, so `tokens.css` and the faces are one cache entry for
 * the whole site rather than one per directory depth. Links *between* pages
 * stay relative, computed by `relativeTo`, because those are the site's own
 * structure and nothing outside it needs to agree about them.
 *
 * The cost is that a documentation page opened straight off the disk as a
 * `file://` URL loses its stylesheets. `npm run serve` exists for that, and
 * serves from the root the way the host does.
 */
const SHARED_HEAD = `<!-- The theme, resolved before the first paint. \`tokens.css\` carries dark on
     the bare :root so an unstamped document is still complete, which means a
     reader who chose light would otherwise see one dark frame. This block is
     character for character the one in \`index.html\`; \`assets/theme.js\` owns
     every later resolution and all three share the storage key. The console's
     \`index.html\` carries the same block for the same reason. -->
<script>
  ;(function () {
    try {
      var stored = localStorage.getItem('telecraft.theme')
      var choice = stored === 'light' || stored === 'dark' ? stored : 'system'
      document.documentElement.dataset.theme =
        choice === 'system'
          ? matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : choice
    } catch (error) {
      document.documentElement.dataset.theme = 'dark'
    }
  })()
</script>
<!-- The product's own mark: the card face's three reading bands, stacked and
     decreasing (identity.md). Naming it here also stops the browser's default
     /favicon.ico request, which a static host answers with a 404. -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<!-- Self-hosted, like everything else (ADR-0019, ADR-0045 §5). The upright is
     the only face the first paint needs; the italic and the mono are used by
     the prose and the listings, and both arrive well before a reader reaches
     one. -->
<link rel="preload" href="/assets/fonts/AtkinsonHyperlegibleNext.woff2" as="font" type="font/woff2" crossorigin>
<!-- Faces, then values, then elements, then structure. The first three are
     copies of the console's, listed in \`tools/vendored.json\`. -->
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/tokens.css">
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/docs.css">
<script src="/assets/theme.js" defer></script>`;

// The licence the project actually grants (telecraft ADR-0050 §6), worded
// and linked as the landing page's colophon words and links it.
const COLOPHON = `<p class="colophon"><a href="https://github.com/telecraft-dev/telecraft/blob/main/LICENSE">Elastic License 2.0</a> · © 2026 the Telecraft project</p>`;

// Identical markup to the landing page's, because one script serves both.
// The comment above it there explains the shape; keep the two in step.
const THEME_CONTROL = `  <!-- Three states, not two: following the machine is the honest default and
       a switch cannot say it, so this is a radio group and not a toggle. Its
       marks are drawn in the sheet's own hairline stroke and each one carries
       its name for anybody the drawing does not reach. Unhidden by
       \`assets/theme.js\`: a control that cannot act is worse than no control,
       and without script the page still resolves to a complete theme from the
       bare :root block. -->
  <fieldset class="theme-control" hidden>
    <legend>Theme</legend>
    <label class="theme-option" title="Follow the system">
      <input type="radio" name="theme" value="system">
      <svg class="theme-mark" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.2" width="12" height="8.2" rx="1.3"/><path d="M5.8 13.4h4.4"/></svg>
      <span>System</span>
    </label>
    <label class="theme-option" title="Light">
      <input type="radio" name="theme" value="light">
      <svg class="theme-mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/></svg>
      <span>Light</span>
    </label>
    <label class="theme-option" title="Dark">
      <input type="radio" name="theme" value="dark">
      <svg class="theme-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.1 9.7A5.7 5.7 0 0 1 6.3 2.9a5.7 5.7 0 1 0 6.8 6.8Z"/></svg>
      <span>Dark</span>
    </label>
  </fieldset>`;

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
      ? `<p><a href="${escapeHtml(`${repo}/blob/main/${path.posix.join(editPath, sourcePath)}`)}" rel="noopener">Edit this page on GitHub</a></p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title === siteTitle ? title : `${title} · ${siteTitle}`)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">\n` : ''}${SHARED_HEAD}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <!-- The bare mark, at ascender height beside the wordmark, which is the
       arrangement the pack's own horizontal lockup uses. The geometry is
       telecraft's docs/branding/pack/telecraft-mark-mono.svg unchanged; the
       fills are tokens rather than the hex the pack writes, because the pack
       ships one file per ground and a page that follows the reader's theme
       needs one drawing that works on both. It supports the word and does
       not replace it, so the wordmark stays live text.

       This header is the one the landing page repeats by hand, theme
       control and all. Change it here and change it in index.html. -->
  <a class="wordmark" href="${href('index.html')}"><svg class="wordmark-mark" viewBox="0 0 18 16" aria-hidden="true"><rect x="0" y="0" width="2" height="16" rx="1" fill="var(--brand)"/><rect x="5" y="0" width="13" height="3" rx="1.5" fill="var(--colour-text)"/><rect x="5" y="6.5" width="10" height="3" rx="1.5" fill="var(--colour-text-muted)"/><rect x="5" y="13" width="7" height="3" rx="1.5" fill="var(--colour-text-faint)"/></svg><span class="wordmark-lead">Tele</span>craft</a>
  <nav class="topnav" aria-label="Site">
    <a href="${href(docsHomeOutput)}"${current === `/${docsHomeOutput}` ? ' aria-current="page"' : ''}>Documentation</a>
    <a href="${escapeHtml(repo || 'https://github.com/telecraft-dev/telecraft')}" rel="noopener">GitHub</a>
  </nav>
${THEME_CONTROL}
</header>
<div class="shell">
${sidebar}
  <main id="content" class="page">
    <article class="prose">
${content}
    </article>
    <footer class="pagefoot">
      ${editLink}
      ${COLOPHON}
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
