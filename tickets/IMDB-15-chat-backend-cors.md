---
id: IMDB-15
title: Chat backend CORS headers so browsers can call /api/chat cross-origin
status: in-review
owner: product-owner
depends-on: []
branch: "imdb-15-chat-backend-cors"
pr: "https://github.com/dperez4787/imdb-browser/pull/11"
---

## Description

The chat backend (merged via IMDB-10, PR #5) sends no `Access-Control-*` headers.
The SPA always calls it cross-origin — from the Vite dev server
(`http://localhost:5173`) in development and from the Firebase Hosting origin in
production — so every browser request to `POST /api/chat` fails the CORS preflight
before the auth layer even runs. Found by the IMDB-11 tester and confirmed against
the merged `app/chat` code. This blocks the live chat demo and the outstanding
human-verification criteria on PRs #5 and #9. The cosmo router already handles this
correctly (verified in `docs/architecture.md`, router auth section: preflight → 204
with `access-control-allow-origin: *` and `Authorization` allowed); the chat backend
should behave the same way.

**Design note for the developer:** mirror the router's wildcard approach —
`Access-Control-Allow-Origin: *`. This is safe here for the same reason it is safe
on the router: auth is a bearer token in the `Authorization` header, the app never
uses cookies or credentialed requests, so a wildcard grants nothing an attacker's
origin couldn't already do with its own token. Do not set
`Access-Control-Allow-Credentials`. If the implementation restricts to known origins
instead, the ticket's criteria still apply from the two real origins, but wildcard
is the recorded default; note any deviation in the Log and in
`docs/architecture.md`'s chat backend contract.

## Acceptance criteria

- An `OPTIONS` preflight to `/api/chat` carrying `Origin: http://localhost:5173`
  and `Access-Control-Request-Headers: authorization,content-type` (method `POST`)
  receives a success response (2xx) whose headers permit the request: an
  `Access-Control-Allow-Origin` that matches the origin (`*` or the origin itself),
  `POST` allowed, and both `authorization` and `content-type` in
  `Access-Control-Allow-Headers`.
- A cross-origin `POST /api/chat` from the dev origin with an invalid bearer token
  returns the auth layer's **401**, and that 401 response itself carries
  `Access-Control-Allow-Origin` — proving CORS no longer blocks the request and
  that even error responses are readable by the browser.
- A valid authenticated `POST /api/chat` returns the SSE stream
  (`Content-Type: text/event-stream`) with `Access-Control-Allow-Origin` present on
  the response, so the browser can read the streamed body cross-origin.
- `GET /health` continues to respond as before (no regression).
- **Human/live criterion:** with the chat backend running, a signed-in user in a
  browser at the Vite dev origin (`http://localhost:5173`) sends a chat message and
  receives a streamed assistant reply — the full flow completes with no CORS errors
  in the browser console. The tester records this as human-verified or explicitly
  not verified.

## Files expected to change

- app/chat/src/*

## Log

- **product-owner** — filed. Defect reported by the IMDB-11 tester and confirmed
  against merged `app/chat` code: no `Access-Control-*` headers, so browser calls
  from the SPA fail preflight. `ready-for-dev` — no UI, and the CORS decision
  follows the router precedent already recorded in `docs/architecture.md` (wildcard
  allow-origin, bearer auth, no credentials). No dependencies; `app/chat` is merged.
- **developer** — claimed. Plan: a small dedicated CORS middleware module
  (`app/chat/src/cors.js`) mounted first in `createApp`, wildcard allow-origin per
  the router precedent, OPTIONS short-circuited to 204 before auth, no
  `Allow-Credentials` ever; colocated `node:test` coverage plus a credential-less
  boot + curl verification.
- **developer** — implemented, PR #11 (draft). Files: `app/chat/src/cors.js` (new
  middleware module, wildcard allow-origin per the router precedent, OPTIONS → 204
  before body parsing and auth, `Allow-Headers: Authorization, Content-Type`, no
  `Allow-Credentials` ever), `app/chat/src/app.js` (mounts `cors()` first),
  `app/chat/src/cors.test.js` (4 tests: preflight shape + verifier never called,
  forged-token cross-origin POST → 401 with allow-origin, SSE response carries
  allow-origin, /health unregressed; each also asserts no credentials header).
  Verified: `npm ci && npm test` 36/36 green; server booted credential-less and
  curled live — OPTIONS preflight 204 with all required headers, forged-token POST
  401 with `Access-Control-Allow-Origin: *`, /health 200 `{"status":"ok"}`.
  NOT verified (honestly): the human/live criterion — a signed-in browser session
  at `http://localhost:5173` completing a streamed chat round-trip. The SSE
  allow-origin path is proven only by the supertest test with injected
  verifier/agent fakes, not against live Firebase/Anthropic. For the tester.
