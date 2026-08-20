# telecraft.dev

The Telecraft front door. One hand-written page, no build step, deployed to
GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.

## Layout

| Path | What |
|---|---|
| `index.html` | The page. Content and structure |
| `assets/site.css` | This site's structure. **The only stylesheet here that is ours to edit** |
| `assets/theme.js` | The theme resolver, after the first paint |
| `assets/tokens.css` | Vendored. Values only, no selectors |
| `assets/base.css` | Vendored. The element layer: typography, links, code, tables, controls, focus rings |
| `assets/fonts/` | Vendored. Two families, three faces, subset and self-hosted, with their licences |
| `favicon.svg` | Vendored. The product's mark |
| `tools/vendored.json` | Where every vendored file came from |
| `tools/vendor.mjs` | Fetch the vendored files, and prove they have not drifted |
| `tools/check-external-assets.mjs` | Nothing the browser fetches comes from another origin |

## The design system is vendored, and that is interim

The tokens, the base sheet and the faces are authored in
[telecraft-dev/telecraft](https://github.com/telecraft-dev/telecraft) — one
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
difference against `main` is reported and not failed — a copy of an unmerged
branch is meant to differ from `main`. **Point `ref` at `main` and rerun
`update` as soon as the source lands**, and drift is fatal again.

## The rules this site is held to

- **Nothing is fetched from another origin** (ADR-0019, ADR-0045 §5). No font
  CDN, no hosted stylesheet, no analytics tag. `tools/check-external-assets.mjs`
  fails on any external sub-resource; a hyperlink is not a sub-resource, so
  `<a href>` may point wherever it likes.
- **Every colour is defined in exactly two blocks, never inside a media query**
  (ADR-0047 §2). That is a property of `tokens.css`, which is not edited here.
  A colour invented in `site.css` would break it, so `site.css` invents none.
- **Hue is never load-bearing** (ADR-0047 §5). No signal-lane colour appears on
  this site at all. The brand amber is the only colour with a job, and
  ADR-0047 §4 confines it to marketing surfaces, of which this is the one.
- **Three theme states, resolved before the first paint.** `system`, `light`,
  `dark`. The inline block in `index.html` stamps the resolution before
  anything is painted; `assets/theme.js` owns every later one. They share the
  storage key `telecraft.theme` and agree by convention — change one and change
  the other. Without script the page still renders a complete theme, because
  the bare `:root` in `tokens.css` carries dark.

## Working on it

There is nothing to install and nothing to build. Serve the directory and open
it:

```sh
python3 -m http.server 8000
```

Both checks are plain Node scripts and need no dependencies:

```sh
node tools/check-external-assets.mjs
node tools/vendor.mjs check
```

## Licence

[Elastic License 2.0](LICENSE), the same licence as the rest of the project
(telecraft ADR-0050 §6).

The vendored design files under `assets/` are copies of the platform
repository's, taken by `tools/vendor.mjs` and covered by the same licence.
The two typefaces beside them are not: they ship under the SIL Open Font
License, whose text travels with the faces in `assets/fonts/`.
