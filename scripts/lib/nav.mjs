// The navigation model.
//
// docs/nav.yaml in telecraft-dev/telecraft is the contract. This module
// reads it, walks the pages it points at, and returns the whole site
// model. Nothing else in this repository knows the shape of the
// navigation: change nav.yaml and the site changes.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { splitFrontMatter, stripFrontMatter } from './frontmatter.mjs';

/** Where a page ends up, given its path relative to the docs directory. */
export function outputPathFor(docsRelative) {
  if (docsRelative.endsWith('.md')) return `${docsRelative.slice(0, -3)}.html`;
  return docsRelative;
}

/**
 * Is this docs-relative path covered by the `not_published` list?
 *
 * An entry is either a directory name or a file name, both relative to
 * the docs directory. A directory covers everything beneath it.
 */
export function isNotPublished(docsRelative, notPublished) {
  const subject = normalise(docsRelative);
  return notPublished.some((raw) => {
    const entry = normalise(raw);
    return subject === entry || subject.startsWith(`${entry}/`);
  });
}

function normalise(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Read nav.yaml and build the site model.
 *
 * @param {string} docsDir Absolute path to the checked-out `docs/`.
 * @param {(message: string) => void} warn Called for anything the build
 *   survives but a human should see, such as a section nav.yaml declares
 *   whose pages have not landed yet.
 */
export function buildModel(docsDir, warn) {
  const navPath = path.join(docsDir, 'nav.yaml');
  const manifest = parseYaml(fs.readFileSync(navPath, 'utf8'));

  const site = {
    title: 'Documentation',
    description: '',
    base_path: '/docs',
    repository: '',
    edit_path: 'docs',
    ...(manifest.site ?? {}),
  };
  const basePath = `/${String(site.base_path ?? '/docs').replace(/^\/+|\/+$/g, '')}`;
  const notPublished = manifest.not_published ?? [];

  // Everything keyed by its path relative to the docs directory.
  const pages = new Map();

  const addPage = (docsRelative, extra) => {
    if (isNotPublished(docsRelative, notPublished)) {
      throw new Error(
        `nav.yaml both publishes and denies ${docsRelative}; not_published wins, so fix nav.yaml`,
      );
    }
    const absolute = path.join(docsDir, docsRelative);
    if (!fs.existsSync(absolute)) {
      warn(`nav.yaml lists ${docsRelative}, which is not in the checkout yet; skipping it`);
      return null;
    }

    const isMarkdown = docsRelative.endsWith('.md');
    let data = {};
    let body = '';
    if (isMarkdown) {
      const source = fs.readFileSync(absolute, 'utf8');
      try {
        ({ data, body } = splitFrontMatter(source));
      } catch (error) {
        // Front matter that YAML will not parse. The commonest cause by
        // far is an unquoted value containing a colon — `description: The
        // layout: root files, ...` is a nested mapping to a YAML parser
        // and a sentence to everybody else.
        //
        // The same reasoning as a page that has not landed: a documentation
        // repository this one does not control should not be able to take
        // telecraft.dev down by one line. The page publishes with its title
        // from nav.yaml or from its filename, the block is dropped rather
        // than rendered as prose, and the warning names the file so it can
        // be fixed where it is authored. `--strict` makes it fatal.
        warn(
          `${docsRelative} has front matter that is not valid YAML (${error.message.split('\n')[0]}); ` +
            'publishing it without its front matter',
        );
        data = {};
        body = stripFrontMatter(source);
      }
    }

    const output = path.posix.join(basePath.slice(1), outputPathFor(docsRelative));
    const page = {
      source: docsRelative,
      output,
      url: `/${output}`,
      title: extra.title ?? data.title ?? deriveTitle(docsRelative),
      description: data.description ?? extra.description ?? '',
      order: numberOr(data.order, numberOr(extra.order, 500)),
      sectionId: extra.sectionId ?? null,
      isSectionIndex: Boolean(extra.isSectionIndex),
      format: isMarkdown ? 'markdown' : 'copy',
      body,
    };
    pages.set(docsRelative, page);
    return page;
  };

  // Sections. Every Markdown file directly inside a section directory is
  // published; nav.yaml names the directory, the front matter orders it.
  const sections = [];
  for (const declared of manifest.sections ?? []) {
    const dir = path.join(docsDir, declared.path);
    if (!fs.existsSync(dir)) {
      warn(`section "${declared.id}" points at ${declared.path}/, which is not in the checkout yet`);
      continue;
    }
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.posix.join(declared.path, entry.name))
      .filter((rel) => !isNotPublished(rel, notPublished))
      .sort();

    const sectionPages = [];
    let index = null;
    for (const rel of files) {
      const isIndex = path.posix.basename(rel) === 'index.md';
      const page = addPage(rel, { sectionId: declared.id, isSectionIndex: isIndex });
      if (!page) continue;
      if (isIndex) index = page;
      else sectionPages.push(page);
    }

    if (!index && sectionPages.length === 0) {
      warn(`section "${declared.id}" has no pages yet; leaving it out of the navigation`);
      continue;
    }

    sections.push({
      ...declared,
      pages: sectionPages,
      index,
      // A section with pages but no index.md still needs a landing page,
      // so the build generates one from the summary in nav.yaml.
      generatedIndex: index
        ? null
        : {
            output: path.posix.join(basePath.slice(1), declared.path, 'index.html'),
            url: `/${path.posix.join(basePath.slice(1), declared.path, 'index.html')}`,
          },
    });
  }

  const sectionsById = new Map(sections.map((section) => [section.id, section]));

  // Extra pages: published, but outside a section directory. Some of
  // them attach to a section for navigation purposes.
  const standalone = [];
  for (const declared of manifest.pages ?? []) {
    const page = addPage(declared.path, {
      title: declared.title,
      order: declared.order,
      sectionId: declared.section ?? null,
    });
    if (!page) continue;
    if (declared.format === 'html' || !declared.path.endsWith('.md')) page.format = 'copy';

    const section = declared.section ? sectionsById.get(declared.section) : null;
    if (declared.section && !section) {
      warn(`page ${declared.path} names section "${declared.section}", which is not published`);
    }
    if (section) section.pages.push(page);
    else standalone.push(page);
  }

  const byOrderThenTitle = (a, b) => a.order - b.order || a.title.localeCompare(b.title, 'en-GB');
  for (const section of sections) section.pages.sort(byOrderThenTitle);
  standalone.sort(byOrderThenTitle);

  return { site, basePath, notPublished, sections, standalone, pages };
}

function deriveTitle(docsRelative) {
  const stem = path.posix.basename(docsRelative).replace(/\.[^.]+$/, '');
  const words = stem.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
