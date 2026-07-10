---
id: IMDB-11
title: Chat assistant UI in the SPA
status: needs-design
owner: product-owner
design: ""   # to be filled by ui-ux-designer
depends-on: [IMDB-2, IMDB-10]
branch: ""
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
