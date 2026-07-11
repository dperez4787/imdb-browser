---
id: IMDB-11
title: Chat assistant UI in the SPA
status: done
owner: product-owner
design: designs/DES-7-chat-concierge.md
depends-on: [IMDB-2, IMDB-10]
branch: "imdb-11-chat-ui"
pr: "https://github.com/dperez4787/imdb-browser/pull/9"
---

## Description

The ever-present chat assistant the brief's product intent calls for: a signed-in user
can ask questions about the IMDb data from anywhere in the app and get answers from the
IMDB-10 backend. The frontend never sees `ANTHROPIC_API_KEY` and never calls Anthropic
directly — every chat request goes to our chat backend carrying the user's Firebase ID
token (from IMDB-2's auth module). Message transport (streaming vs not, history model)
follows the API contract IMDB-10's architecture decision records.

Designer must answer: what "ever-present" looks like (docked panel? floating
launcher?), conversation layout, in-flight/streaming rendering per the decided
contract, error and retry treatment, empty/first-run state, and keyboard/focus
behavior.

## Acceptance criteria

- From any signed-in view, the designed chat affordance is visible; opening it and
  sending a data question renders the assistant's answer in the conversation as the
  design specifies (including the streaming/in-flight treatment per the contract).
- The browser's network traffic for chat goes only to our chat backend — no request to
  any Anthropic endpoint, and no Anthropic key anywhere in the served bundle.
- Chat requests carry the signed-in user's Firebase ID token; a backend rejection
  (e.g. expired token) and a backend error each render the designed error state with
  the designed retry path.
- Conversation history within a session behaves as the design/contract specify.
- Signed-out users never see the chat UI (AuthGate).

## Files expected to change

- app/frontend/src/chat/ (chat UI components + tests)
- app/frontend/src/App.jsx (mount the ever-present affordance)

## Log

- **product-owner** — filed. `needs-design`; also depends on IMDB-10's API contract
  (itself `needs-architecture`), so the design spec should be written against the
  decided contract.
- **ui-ux-designer** — design spec written: `designs/DES-7-chat-concierge.md`.
  "Ever-present" decided as a right-docked 380px panel the content reflows around
  (overlay/sheet at smaller widths), toggled by TopBar button + Cmd/Ctrl+/ and
  persistent across navigation; conversation layout, empty/first-run prompts, error
  vs auth-rejection states with the retry-replaces rule, and keyboard/focus behavior
  all specified. The IMDB-10 contract is still in flight, so the spec defines the
  rendering for BOTH transport outcomes (streaming: progressive text + caret;
  non-streaming: typing indicator) — the developer follows whichever the contract
  states, deciding nothing. Design leaves no open decision → `ready-for-dev`
  (contract ordering rides depends-on IMDB-10).
- **developer** — claimed. Branch `imdb-11-chat-ui` off `main` (which now contains
  IMDB-2's auth gate and IMDB-10's chat backend, so both dependencies are satisfied
  — their ticket frontmatter lags but both are merged). Implementing against the
  decided contract: SSE streaming (`text`/`tool`/`done`/`error`), stateless
  client-resent history capped at 20 messages / 16 KB, Firebase ID token from
  `auth.js#getIdToken()`, chat URL from `VITE_CHAT_URL` (localhost:8080 default).
- **developer** — implemented; PR #9 (draft), `in-review`.
  **What changed:** `app/frontend/src/chat/` — `chatApi.js` (the one chat network
  boundary, auth.js-style: token attach, 20-msg/16 KB history caps, fetch +
  ReadableStream SSE parser for the contract's four events), `useChatSession.js`
  (send/retry/reset, interleaved tool/text draft, error kinds), `ChatProvider.jsx`
  (open state, Cmd/Ctrl+/, unread dot, focus wiring), `ChatPanel/ChatToggle/
  MessageList/UserMessage/AssistantMessage/TypingIndicator/ToolIndicator/
  ChatComposer/ChatErrorNotice/EmptyChat`, `markdown.jsx` (element-emitting,
  sanitized, dependency-free) + tests; `AppShell.jsx` (reflow layout + mount —
  the ticket said App.jsx, but AppShell is the shell chrome and already reserved
  the mount point), `TopBar.jsx` (toggle), `styles.css` (DES-7 section),
  `scaffold-conventions.test.js` (fetch ban now scoped to sanctioned boundary
  modules — IMDB-4 will need the same carve-out for `src/graphql/`).
  **Verified:** 94 frontend tests green (SSE parser vs synthetic streams: all four
  event types, split/malformed frames, mid-stream error, truncated stream, HTTP
  mappings, caps; every DES-7 state at the chatApi seam); `npm run build` green,
  zero `anthropic` strings in the bundle; REAL credential-less `app/chat` booted
  locally (`/health` 200) and the UI's real fetch → real 401 → designed
  auth-rejection state, via jsdom/vitest (`CHAT_INTEGRATION=1` +
  `VITE_CHAT_URL`), no browser automation available here.
  **Not verified / honest gaps:** the full authenticated streamed conversation
  (needs real key + Google sign-in) — the tester/user must demo it; real-browser
  layout (reflow/scrim/sheet/focus-trap) beyond jsdom. **Problems found outside
  this ticket:** (1) the chat backend sends no CORS headers, so a real browser on
  the Vite/Hosting origin will fail preflight against it — IMDB-10 surface, needs
  a follow-up before the live demo; (2) assistant-markdown in-app links do plain
  `<a>` navigation until the router ticket lands (no react-router in the app yet),
  which loses the in-memory conversation on click.
- **tester** — verdict: **4 of 5 criteria PASSED, 1 NOT VERIFIED** → back to
  `in-progress`; PR #9 **stays a draft** (a not-verified criterion is not a pass —
  same rule as IMDB-2/IMDB-10). Wrote my own suite rather than re-running the
  developer's: `src/chat/imdb11-sse.tester.test.js` (SSE boundary vs synthetic
  ReadableStreams: event ordering, every-byte-boundary splits, mid-UTF-8-char
  splits, CRLF, malformed/comment/unknown/wrong-shape frames, mid-stream `error`,
  empty + truncated streams) and `src/chat/imdb11-ui.tester.test.jsx` (DES-7
  states through the REAL AppShell with chatApi faked at the seam: empty state +
  the three prompts, shimmer→tool-lines→progressive-text-with-caret→committed
  answer in stream order, error-with-Retry-replaces-never-duplicates,
  auth-rejection-no-Retry-composer-disabled, reflow-not-overlay both structurally
  and in the stylesheet, stateless history resend, New chat). Clean checkout:
  `npm ci && npm test` in app/frontend → **113 passed, exit 0** (94 developer +
  19 tester); `npm run build` exit 0. Per criterion:
  1. *Affordance visible from any signed-in view; answer renders per design incl.
     streaming* — **PASS at the component/contract level; live authenticated
     streamed conversation NOT VERIFIED** (needs a real `ANTHROPIC_API_KEY` +
     interactive Google sign-in). Human steps: `app/chat`: copy `.env.example` →
     `.env` with a real key, `npm start`; `app/frontend`:
     `VITE_CHAT_URL=http://localhost:8080 npm run dev`, sign in with Google, open
     the concierge (💬 or Cmd/Ctrl+/), ask a data question, watch tool lines +
     progressive text stream in. **Expect the browser demo to fail CORS preflight
     first** — the backend sends no `Access-Control-*` headers (confirmed by grep
     of `app/chat/src`; IMDB-10 surface, needs a follow-up ticket or a Vite dev
     proxy).
  2. *Chat traffic only to our backend; no Anthropic key in bundle* — **PASS**
     (structural + bundle evidence): built `dist/` greps **zero** for
     `anthropic`/`sk-ant`/`api.anthropic.com`; `chatApi.js` is the only fetch
     site, enforced by the hardened scaffold-conventions test (green). Live
     browser network capture rides the same demo as #1.
  3. *Firebase ID token attached; 401 and backend error render designed states* —
     **PASS, with a REAL cross-boundary check**: booted the actual merged
     `app/chat` credential-less (`/health` 200); raw `curl` POST with a forged
     Bearer → real 401 `{"error":{"message":"Invalid or expired token"}}`; then
     `CHAT_INTEGRATION=1 VITE_CHAT_URL=http://localhost:8787 npx vitest run
     src/chat/chatApi.integration.test.jsx` (jsdom — no browser automation here):
     the panel's real fetch hit the real backend and rendered the designed
     auth-rejection state (no Retry, composer disabled) — 2 passed. Backend-error
     state + Retry-replaces verified in my component tests.
  4. *Session history per design/contract* — **PASS**: full client-held history
     re-sent newest-last (stateless), 20-msg/16 KB caps at the boundary, in-memory
     per session, New chat clears in one click.
  5. *Signed-out users never see the chat UI* — **PASS** through the real App
     composition root: signed out, no toggle/panel/dock in the DOM; sign-out
     removes chat UI and its session.
  Conventions: no `fetch()` outside the sanctioned boundary, no secrets in the
  diff, ES modules — all green. The developer's Log/PR claims all **checked out
  accurately**, including its self-reported gaps and the CORS blocker.
- **product-owner** — status → `done`: PR #9 merged by the user (directive 2026-07-11 — human-only live criteria are deferred to the upcoming testing period, assume-works).
