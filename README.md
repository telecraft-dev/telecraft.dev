# telecraft.dev

The Telecraft front door and the documentation site behind it, at
<https://telecraft.dev>. The landing page is written here; the
documentation is not.

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

## Layout

| Path | What |
|---|---|
| `index.html` | The landing page. Content and structure |
| `assets/site.css` | The landing page's structure |
| `assets/docs.css` | The documentation pages' structure |
| `assets/theme.js` | The theme resolver, after the first paint |
| `assets/tabs.js` | The landing page's deployment tabs, which are two stacked sections without it |
| `preview/worker.js` | Maps a preview hostname to that pull request's Pages deployment |
| `preview/wrangler.toml` | The Worker's route and the one command that deploys it |
| `assets/tokens.css` | Vendored. Values only, no selectors |
| `assets/base.css` | Vendored. The element layer: typography, links, code, tables, controls, focus rings |
| `assets/fonts/` | Vendored. Two families, three faces, subset and self-hosted, with their licences |
| `favicon.svg` | Vendored. The product's mark |
| `scripts/build.mjs` | The build. Reads a checkout of telecraft's `docs/`, writes `_site/` |
| `scripts/lib/` | Navigation model, Markdown rendering, front matter, page shell |
| `scripts/serve.mjs` | Serves `_site/` for a local look |
| `tools/vendored.json` | Where every vendored file came from |
| `tools/vendor.mjs` | Fetch the vendored files, and prove they have not drifted |
| `tools/check-external-assets.mjs` | Nothing the browser fetches comes from another origin |

`assets/site.css` and `assets/docs.css` are the two stylesheets here that
are ours to edit. Both are structure over the vendored element layer, and
neither invents a colour.

The landing page shows the product rather than describing it: the verdict
panel, the console strip, the outcome cross and the two deployment diagrams
are built from the vendored tokens and element sheet, so they cannot disagree
with the console about a colour or a face, and they stay right in both themes
at every width. No screenshot is used, and none should be: a screenshot is
correct in one theme, at one width, on one release. Every outcome on the page
is drawn as one of the state marks with its word beside it, and no severity or
signal colour appears anywhere, which is what keeps the page inside ADR-0047
§5 while carrying product surfaces.

## How the build works

`scripts/build.mjs` reads a checkout of `docs/`, renders every Markdown
page to static HTML, and writes the result to `_site/`: the landing page
and the assets at the root, the documentation under `/docs`.

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
- The site makes no external requests, and the build proves it: the last
  thing `npm run build` does is run `tools/check-external-assets.mjs`
  over `_site/`.

Pages that `nav.yaml` lists but that have not landed in telecraft yet
produce a warning rather than a failure, so a documentation change still
in review cannot take the site down. Run the build with `--strict` to
turn those warnings into errors. A missing `nav.yaml` warns too, and
publishes the landing page alone rather than nothing.

## Both pages are the same site

The landing page and every documentation page carry the same `<head>`:
the pre-paint theme resolver, the mark, the font preload, and the
stylesheets in the order `fonts.css`, `tokens.css`, `base.css`, then the
page's own sheet. `scripts/lib/layout.mjs` emits that shell for the
documentation; `index.html` carries it by hand. They agree by
convention: change one and change the other.

## The design system is vendored, and that is interim

The tokens, the base sheet and the faces are authored in
[telecraft-dev/telecraft](https://github.com/telecraft-dev/telecraft), one
implementation, one palette check, one set of accessibility floors. ADR-0047's
consequences say this repository's dependency on them should be "a versioned
release, not a copy".

**It is a copy.** There is no release to depend on: `telecraft` has no tagging
scheme yet, that is
[telecraft#86](https://github.com/telecraft-dev/telecraft/issues/86), and it is
being decided separately. Rather than invent a second answer in front of that
decision, every copy here records where it came from and a check fails when the
copy and the source disagree.

Each vendored stylesheet carries a header naming the source path and the exact
commit. `tools/vendored.json` records the same, with a SHA-256 of every file
including the binary ones, which cannot carry a header.

```sh
node tools/vendor.mjs check           # verify every copy
node tools/vendor.mjs update [ref]    # refetch every copy at ref
```

The check runs on every pull request and weekly, because drift happens
upstream, on a day when nothing changed here.

While `ref` in `tools/vendored.json` names anything other than `main`, a
difference against `main` is reported and not failed, because a copy of an unmerged
branch is meant to differ from `main`. **Point `ref` at `main` and rerun
`update` as soon as the source lands**, and drift is fatal again.

## The rules this site is held to

- **Nothing is fetched from another origin** (ADR-0019, ADR-0045 §5). No font
  CDN, no hosted stylesheet, no analytics tag. `tools/check-external-assets.mjs`
  fails on any external sub-resource; a hyperlink is not a sub-resource, so
  `<a href>` may point wherever it likes. It runs over the source tree in CI
  and over `_site/` at the end of every build.
- **Every colour is defined in exactly two blocks, never inside a media query**
  (ADR-0047 §2). That is a property of `tokens.css`, which is not edited here.
  A colour invented in `site.css` or `docs.css` would break it, so neither
  invents one.
- **Hue is never load-bearing** (ADR-0047 §5). No signal-lane colour appears on
  this site at all. The brand amber is the only colour with a job, and
  ADR-0047 §4 confines it to marketing surfaces, of which the landing page is
  the one.
- **Three theme states, resolved before the first paint.** `system`, `light`,
  `dark`. The inline block in `index.html`, and its twin in
  `scripts/lib/layout.mjs`, stamp the resolution before anything is painted;
  `assets/theme.js` owns every later one. They share the storage key
  `telecraft.theme` and agree by convention: change one and change the
  other. Without script a page still renders a complete theme, because the
  bare `:root` in `tokens.css` carries dark.

## Working on it

You need Node.js 20 or later.

1. Clone this repository and install the dependencies.

   ```sh
   git clone https://github.com/telecraft-dev/telecraft.dev.git
   cd telecraft.dev
   npm ci
   ```

2. Get a copy of the documentation. The build looks for `telecraft/docs`
   by default, and that path is git-ignored.

   ```sh
   git clone --depth 1 https://github.com/telecraft-dev/telecraft.git telecraft
   ```

3. Build the site, then look at it.

   ```sh
   npm run build
   npm run serve      # http://localhost:4321
   ```

To build from a checkout somewhere else, pass `--docs`:

```sh
npm run build -- --docs ../telecraft/docs
```

| Command | What it does |
|---|---|
| `npm run build` | Builds `_site/`, including the external-asset check |
| `npm run build -- --strict` | Fails the build on any warning |
| `npm run check:external` | Runs the external-asset check on `_site/` on its own |
| `npm run check:vendored` | Proves the vendored copies have not drifted |
| `npm run serve` | Serves `_site/` on <http://localhost:4321> |
| `npm test` | Builds a fixture documentation tree and asserts what the build promises |

Both `tools/` scripts are plain Node and need no dependencies, so they run
against a bare checkout too:

```sh
node tools/check-external-assets.mjs
node tools/vendor.mjs check
```

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

`.github/workflows/checks.yml` runs the same rules on every pull request
and weekly, and deploys nothing.

## How a pull request is previewed

Reading a diff of `index.html` is not reading the page, so every pull request
gets the whole site at a URL on the project's own domain:

```
https://site-<number>.ci.telecraft.dev
```

The link points at that pull request's latest build and stays right as you
push. It is posted as one comment, edited in place, and set as the `preview`
commit status beside the checks.

The files are on Cloudflare Pages; the hostname is `preview/worker.js`, a
Worker that maps `site-<number>.ci` to that pull request's deployment and
passes the response through. The Worker derives the mapping from the hostname,
so a new pull request needs nothing deploying to it, and it sets two headers on
every preview: `X-Robots-Tag: noindex`, because a preview on this domain
carrying an unreviewed front door would otherwise compete with the real one in
a search result, and `frame-ancestors 'none'`.

### The build holds no credential, and the deploy never runs branch code

Two workflows, and the split is the security design rather than an accident of
structure.

| Workflow | Trigger | Holds a credential |
|---|---|---|
| `.github/workflows/preview.yml` | `pull_request` | No |
| `.github/workflows/preview-deploy.yml` | `workflow_run` on the above | Yes |

The build stage runs code from the branch under review: `npm ci` executes
whatever that branch's lockfile resolves to, and the branch may come from a
fork. So it runs with a read-only token, holds no secret, and only uploads
`_site/` and the pull request number as artifacts. The deploy stage is a
`workflow_run` workflow, which always runs the copy on the default branch
whatever the branch under review says, and it never checks that branch out:
the artifact crosses as data and is never executed, and the number is read as
digits before it reaches a shell or an API call. A pull request cannot reach
the Cloudflare token by editing a workflow, by adding a dependency with an
install script, or by any other route that needs its own code to run.

Production is unaffected: `pages.yml` still deploys `telecraft.dev` to GitHub
Pages, and Cloudflare serves previews and nothing else.

### Three preconditions, because the previews are on our own zone

A preview runs a fork's script on a hostname inside `telecraft.dev`. No header
stops that script calling `document.cookie`, so what keeps it away from the
rest of the zone is not in this repository. All three of these are cheap now
and expensive later.

**`ci.telecraft.dev` goes on the Public Suffix List.** With that entry a
browser treats every preview as its own site: cross-site from `telecraft.dev`,
from `app.telecraft.dev`, and from every other preview, so a preview cannot
carry a `SameSite` cookie to any of them. ADR-0072 §2 already commits to
submitting `app.telecraft.dev`, and this is one more label on the same
submission. **Submit both together.** It is the longest lead time of anything
here, months rather than days, because it ships in browser releases rather than
in a deploy.

**Every session cookie the project sets is `__Host-` prefixed.** The prefix
forbids a `Domain` attribute and requires `Secure` and `Path=/`, which means
no cookie set anywhere else in the zone can shadow it. That closes the one
thing the Public Suffix List entry does not: a preview may still be able to set
a `Domain=telecraft.dev` cookie, and a `__Host-` cookie cannot be shadowed by
one. ADR-0072 §2 already makes the front door's cookie host-only, which is the
same intent; the prefix is what makes a browser enforce it. Neither the front
door nor the Instance's cookie is written yet, so adopting it now costs
nothing.

**Nothing that holds a session shares an origin with a preview.** Previews are
`site-<number>.ci`, the hosted service is `<organisation>.app`, and neither is
ever the apex. That is already true and is worth keeping true.

The risk is entirely theoretical today, which is the reason to do this now:
`app.telecraft.dev` does not resolve, `demo.telecraft.dev` has no sign-in, and
there is no session anywhere in the zone to attack. The Public Suffix List
entry therefore has the months it needs before there is anything for it to
protect. **If the hosted service is about to launch and the entry has not
landed, move previews back to `pages.dev`**, which is one line in
`preview-deploy.yml`.

### Setting it up

Once, by hand, against the Cloudflare account that already holds the zone.

1. The Pages project, which is where the files go.

   ```sh
   npx wrangler@4.127.0 pages project create telecraft-dev --production-branch main
   ```

2. A proxied wildcard DNS record, `*.ci` on `telecraft.dev`. The value does not
   matter, because the Worker route answers before it is reached; `192.0.2.1`
   is the conventional choice.

3. The Worker, which is the hostname.

   ```sh
   npx wrangler@4.127.0 deploy --config preview/wrangler.toml
   ```

4. Two repository secrets.

   | Secret | What |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | An API token with **Cloudflare Pages: Edit** on that account, and nothing else. The Worker is deployed by hand, so this token never needs to touch it |
   | `CLOUDFLARE_ACCOUNT_ID` | The account id, from the dashboard sidebar |

**The certificate is the one thing here that costs money.** Universal SSL
covers `telecraft.dev` and `*.telecraft.dev`, and a wildcard matches one label,
so `site-8.ci.telecraft.dev` is not covered. Serving it needs Advanced
Certificate Manager, which is a paid add-on on the zone, for a wildcard on
`*.ci.telecraft.dev`.

If that is not worth it, one label is free and the change is small: set
`PREVIEW_ZONE` to `telecraft.dev` in `preview-deploy.yml` and have it emit
`site-8-ci.telecraft.dev`, change the Worker's pattern to
`site-*-ci.telecraft.dev/*` and its hostname match to suit, and the DNS record
to `site-*-ci`. Everything else is unchanged, and Universal SSL covers it.

Old previews are left alone; `wrangler pages deployment delete` removes one if
it ever matters.

**A `workflow_run` workflow only fires from the default branch.** The pull
request that adds `preview-deploy.yml` therefore does not get a preview of
itself, and neither does any pull request opened before it merges. The first
one to get a URL is the first one opened after it lands on `main` with all four
steps above done. That is the same property that makes the split safe, seen
from the other side.

## Licence

[Elastic License 2.0](LICENSE), the same licence as the rest of the project
(telecraft ADR-0050 §6).

The vendored design files under `assets/` are copies of the platform
repository's, taken by `tools/vendor.mjs` and covered by the same licence.
The two typefaces beside them are not: they ship under the SIL Open Font
License, whose text travels with the faces in `assets/fonts/`.
