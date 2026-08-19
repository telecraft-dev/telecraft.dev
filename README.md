# telecraft.dev

The website for the Telecraft project: the landing page and the
documentation site at <https://telecraft.dev>.

## Where the content comes from

Two places, and only one of them is this repository.

Landing page
: `index.html` here. Hand written, self-contained, no build step of its
  own. The build copies it to the root of the site.

Documentation
: `docs/` in [telecraft-dev/telecraft](https://github.com/telecraft-dev/telecraft),
  published under `/docs`. Nothing in this repository decides what the
  documentation says or how it is organised.

`docs/nav.yaml` in telecraft is the contract between the two. It names
the sections, the pages published outside a section, and the
`not_published` list of working material that must never reach the site.
The build derives the whole navigation from that file and from each
page's YAML front matter, so there is no second copy of the navigation
here: change `nav.yaml` and the site changes.

## How the build works

`scripts/build.mjs` reads a checkout of `docs/`, renders every Markdown
page to static HTML, and writes the result to `_site/`.

- Markdown is rendered with [markdown-it](https://github.com/markdown-it/markdown-it),
  with tables, description lists, and heading anchors. Fenced code is
  highlighted at build time by [highlight.js](https://highlightjs.org/),
  so no highlighting runs in the browser.
- Relative links between pages are rewritten to the URL the target page
  is published at: a link to `../guides/quickstart.md` becomes
  `../guides/quickstart.html`. A link into the `not_published` working
  corpus becomes a link to that file on GitHub, which is where it reads
  best.
- `not_published` is enforced, not assumed. If a denied path ever
  reaches the output, the build fails.
- `terminology.html` is a finished, self-contained document, so it is
  copied through byte for byte.
- The site makes no external requests. There are no CDN scripts, remote
  stylesheets, web fonts, or analytics: everything a page needs is
  served from telecraft.dev. `scripts/check-no-external.mjs` scans the
  built output for anything the browser would fetch from another host
  and fails the build if it finds one. Links a reader clicks are fine;
  requests the page makes on its own are not.

Documentation pages use the landing page's palette, typeface stack, and
light and dark handling, extended with a section sidebar, a page table of
contents, a readable measure, and styled code blocks. The styles live in
`assets/docs.css`, which is copied to `/assets/docs.css`.

Pages that `nav.yaml` lists but that have not landed in telecraft yet
produce a warning rather than a failure, so a documentation change still
in review cannot take the site down. Run the build with `--strict` to
turn those warnings into errors.

## Run the build locally

You need Node.js 20 or later.

1. Clone this repository and install the dependencies.

   ```bash
   git clone https://github.com/telecraft-dev/telecraft.dev.git
   cd telecraft.dev
   npm ci
   ```

2. Get a copy of the documentation. The build looks for `telecraft/docs`
   by default, and that path is git-ignored.

   ```bash
   git clone --depth 1 https://github.com/telecraft-dev/telecraft.git telecraft
   ```

3. Build the site, then look at it.

   ```bash
   npm run build
   npm run serve      # http://localhost:4321
   ```

To build from a checkout somewhere else, pass `--docs`:

```bash
npm run build -- --docs ../telecraft/docs
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Builds `_site/`, including the external-request check |
| `npm run build -- --strict` | Fails the build on any warning |
| `npm run check:external` | Runs the external-request check on `_site/` on its own |
| `npm run serve` | Serves `_site/` on <http://localhost:4321> |
| `npm test` | Builds a fixture documentation tree and asserts what the build promises |

## How it deploys

`.github/workflows/pages.yml` builds the site and deploys it to GitHub
Pages. Three things start it:

- a push to this repository's `main`,
- a manual run from the **Actions** tab (`workflow_dispatch`),
- a `repository_dispatch` of type `docs-updated`, which
  telecraft-dev/telecraft sends when a documentation change lands on its
  `main`.

Whatever starts the build, the documentation always comes from
telecraft's `main`. The dispatch payload is input from another
repository, so the workflow never uses it to choose a ref and never
passes it to a shell script. It reads it once, through `env`, to log
which commit asked for the build.
