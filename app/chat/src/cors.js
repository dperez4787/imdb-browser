// CORS for the chat backend. The SPA always calls this service cross-origin
// (Vite dev server locally, Firebase Hosting in production), so every response
// — including 401s and the SSE stream — must carry Access-Control-Allow-Origin
// or the browser refuses to hand the body to the app.
//
// Mirrors the cosmo router's recorded precedent (docs/architecture.md, router
// auth section; IMDB-15): wildcard allow-origin. That is safe here for the same
// reason it is safe on the router — auth is a bearer token in the Authorization
// header, never a cookie, and the app makes no credentialed requests, so a
// wildcard grants an attacker's origin nothing it couldn't already do with its
// own token. For exactly that reason Access-Control-Allow-Credentials is NEVER
// set: the browser rejects `*` + credentials outright, and adding credentials
// support is what would make a wildcard dangerous.
//
// Mounted FIRST in createApp, before the JSON body parser and before authGate:
// a preflight OPTIONS carries no Authorization header by design, so it must
// short-circuit here — 204, headers only — without ever reaching auth.

const PREFLIGHT_MAX_AGE_SECONDS = String(24 * 60 * 60)

export function cors() {
  return function corsHeaders(req, res, next) {
    // On every response, even errors: express headers set here survive into
    // sseStart's flushHeaders, so the stream is readable cross-origin too.
    res.set('Access-Control-Allow-Origin', '*')

    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.set('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS)
      res.status(204).end()
      return
    }

    next()
  }
}
