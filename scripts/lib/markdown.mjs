// Markdown to HTML.
//
// Tables, description lists, and fenced code with highlighting applied
// here at build time, so the browser downloads nothing to read a page.
// Links between pages are rewritten to where those pages actually land.

import path from 'node:path';
import MarkdownIt from 'markdown-it';
import deflist from 'markdown-it-deflist';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Build a renderer for one page.
 *
 * @param {object} options
 * @param {object} options.page The page being rendered.
 * @param {object} options.model The site model from nav.mjs.
 * @param {(message: string) => void} options.warn
 * @returns {{render: (body: string) => string, headings: Array}}
 */
export function createRenderer({ page, model, warn }) {
  const headings = [];
  const seenSlugs = new Map();

  const md = new MarkdownIt({
    html: true,
    linkify: false,
    typographer: false,
    highlight: highlight,
  });

  md.use(deflist);
  md.use(anchor, {
    level: [2, 3, 4],
    slugify: (text) => uniqueSlug(slugify(text), seenSlugs),
    tabIndex: false,
    callback: (token, info) => {
      if (token.tag === 'h2' || token.tag === 'h3') {
        headings.push({ level: Number(token.tag.slice(1)), text: info.title, slug: info.slug });
      }
    },
  });

  // Rewrite every relative link to the URL the target page is published
  // at, so `../guides/quickstart.md` reaches the built guide.
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      const resolved = resolveLink(href, { page, model, warn });
      token.attrs[hrefIndex][1] = resolved.href;
      if (resolved.external) {
        token.attrSet('rel', 'noopener');
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Tables need a wrapper that can scroll on narrow screens.
  md.renderer.rules.table_open = () => '<div class="table-scroll">\n<table>\n';
  md.renderer.rules.table_close = () => '</table>\n</div>\n';

  return {
    render: (body) => md.render(body),
    headings,
  };
}

function uniqueSlug(base, seen) {
  const slug = base || 'section';
  const count = seen.get(slug) ?? 0;
  seen.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count + 1}`;
}

function highlight(code, language) {
  const escaped = (text) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (language && hljs.getLanguage(language)) {
    try {
      const result = hljs.highlight(code, { language, ignoreIllegals: true });
      return `<pre class="code"><code class="hljs language-${escaped(language)}">${result.value}</code></pre>`;
    } catch {
      // Fall through to the plain rendering below.
    }
  }
  return `<pre class="code"><code class="hljs">${escaped(code)}</code></pre>`;
}

/**
 * Turn one link href into the URL it should have on the built site.
 *
 * Absolute URLs, mail links, and bare fragments pass through. Anything
 * else is resolved against the page's own location in the docs tree.
 */
export function resolveLink(href, { page, model, warn }) {
  if (!href || href.startsWith('#') || ABSOLUTE.test(href)) {
    return { href, external: ABSOLUTE.test(href) && !href.startsWith('mailto:') };
  }

  const [pathPart, ...rest] = href.split(/(?=[#?])/);
  const suffix = rest.join('');
  if (!pathPart) return { href, external: false };

  const fromDir = path.posix.dirname(`/${page.source}`);
  const target = path.posix.normalize(path.posix.join(fromDir, pathPart)).replace(/^\/+/, '');

  const known = model.pages.get(target);
  if (known) {
    return { href: relativeTo(page.output, known.output) + suffix, external: false };
  }

  // A link to a section directory rather than to a page in it: `read [the
  // guides](../guides/)`, which is how the prose refers to a whole section.
  // It resolves to that section's index, real or generated. Leaving it as a
  // directory happens to work on a host that serves directory indexes, and
  // that is exactly the kind of dependence on the host's manners this
  // generator was written to avoid: every other link in the output is a flat
  // `.html` file, and so is this one.
  const directory = target.replace(/\/+$/, '');
  const section = model.sections.find((candidate) => candidate.path === directory);
  const sectionIndex = section?.index?.output ?? section?.generatedIndex?.output;
  if (sectionIndex) {
    return { href: relativeTo(page.output, sectionIndex) + suffix, external: false };
  }

  // The working corpus is deliberately unpublished, and the
  // documentation links to it on GitHub instead.
  const sourceUrl = githubUrl(target, model);
  if (isCovered(target, model.notPublished)) {
    return { href: sourceUrl + suffix, external: true };
  }

  // A page that has not landed yet. Keep the link pointing where the
  // page will be, and say so, rather than failing a build over a
  // documentation change still in review.
  const projected = path.posix.join(model.basePath.slice(1), target.replace(/\.md$/, '.html'));
  warn(`${page.source} links to ${target}, which is not published (yet); left as ${'/' + projected}`);
  return { href: relativeTo(page.output, projected) + suffix, external: false };
}

function isCovered(docsRelative, notPublished) {
  return notPublished.some(
    (entry) => docsRelative === entry || docsRelative.startsWith(`${entry.replace(/\/+$/, '')}/`),
  );
}

function githubUrl(docsRelative, model) {
  const repo = String(model.site.repository ?? '').replace(/\/+$/, '');
  const editPath = String(model.site.edit_path ?? 'docs').replace(/^\/+|\/+$/g, '');
  // A link to a directory needs `tree`; a link to a file needs `blob`.
  const view = path.posix.extname(docsRelative) === '' ? 'tree' : 'blob';
  return `${repo}/${view}/main/${path.posix.join(editPath, docsRelative)}`;
}

/** A relative href from one built file to another. */
export function relativeTo(fromOutput, toOutput) {
  const rel = path.posix.relative(path.posix.dirname(fromOutput), toOutput);
  return rel === '' ? path.posix.basename(toOutput) : rel;
}
