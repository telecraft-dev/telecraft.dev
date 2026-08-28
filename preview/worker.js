/*
 * The preview hostname, in front of Cloudflare Pages.
 *
 * `site-<number>.ci.telecraft.dev` is served by this Worker, which maps the
 * hostname to that pull request's Pages deployment and passes the response
 * through. Deployed once, by hand: the mapping is derived from the hostname,
 * so a new pull request needs nothing deploying here. `preview-deploy.yml`
 * pushes the files to Pages and never touches this.
 *
 * Why a Worker rather than a Pages custom domain: this repository keeps the
 * mapping, so what a preview hostname resolves to is a rule in version
 * control rather than a setting in a dashboard, and the two headers below can
 * be set on every preview without asking each build to remember them.
 *
 * The two headers are not decoration.
 *
 * `X-Robots-Tag: noindex` matters more here than it would on `pages.dev`. A
 * preview under the zone is a page on the project's own domain carrying an
 * unreviewed version of the front door, and an indexed one competes with the
 * real front door in a search result.
 *
 * `Content-Security-Policy: frame-ancestors 'none'` stops a preview being
 * framed by anything at all.
 *
 * What this cannot do, and what covers it instead. A preview runs a fork's
 * script, and no header stops that script calling `document.cookie` and
 * setting `Domain=telecraft.dev`. Two things close that, and both live outside
 * this file: `ci.telecraft.dev` on the Public Suffix List, which makes every
 * preview a separate site from the zone and from every other preview; and
 * `__Host-` prefixed session cookies in the front door and in each Instance,
 * which cannot be shadowed by a cookie set anywhere else in the zone. The
 * README records both as preconditions.
 */

/** `site-8.ci.telecraft.dev` and nothing else. Digits only, so a hostname is
 *  never interpolated into the target as text. */
const HOSTNAME = /^site-(\d{1,9})\.ci\./

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const match = HOSTNAME.exec(url.hostname)

    if (!match) {
      return plain(
        404,
        'No preview here.\n\n' +
          'A preview is served at site-<pull request number>.ci.telecraft.dev.\n',
      )
    }

    const project = env.PAGES_PROJECT
    const origin = `pr-${match[1]}.${project}.pages.dev`

    const target = new URL(url)
    target.hostname = origin
    target.protocol = 'https:'
    target.port = ''

    /* `manual` so a redirect the deployment issues is rewritten below rather
       than followed here, which would otherwise resolve to the pages.dev
       hostname and take the reader off the preview domain. */
    const response = await fetch(new Request(target, request), { redirect: 'manual' })

    if (response.status === 404 && url.pathname === '/') {
      return plain(
        404,
        `No preview for pull request ${match[1]}.\n\n` +
          'Either it has not built yet, or the build failed. The Preview\n' +
          'workflow on the pull request says which.\n',
      )
    }

    const headers = new Headers(response.headers)
    headers.set('X-Robots-Tag', 'noindex, nofollow')
    headers.set('Content-Security-Policy', "frame-ancestors 'none'")

    /* A `Location` pointing at the deployment is rewritten back to the
       hostname the reader asked for, so a redirect inside the site keeps them
       on the preview domain. */
    const location = headers.get('Location')
    if (location) {
      try {
        const to = new URL(location, target)
        if (to.hostname === origin) {
          to.hostname = url.hostname
          headers.set('Location', to.toString())
        }
      } catch {
        /* A Location that is not a URL is left exactly as it arrived. */
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}

function plain(status, body) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
