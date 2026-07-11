---
id: IMDB-11
title: Chat assistant UI in the SPA
status: in-progress
owner: product-owner
design: designs/DES-7-chat-concierge.md
depends-on: [IMDB-2, IMDB-10]
branch: "imdb-11-chat-ui"
pr: ""
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
