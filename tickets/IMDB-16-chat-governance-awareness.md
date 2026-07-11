---
id: IMDB-16
title: Chat — flag governed fields conversationally, never guess them
status: needs-design
owner: product-owner
depends-on: [IMDB-10, IMDB-11]
branch: ""
pr: ""
---

## Description

Filed by the governance-platform effort (imdb-policy-service / cosmo-router) for
product-owner triage. This is a demo centerpiece: field-level governance expressed
through the AI experience, live.

The chat backend already forwards the requesting user's Firebase ID token to the
router on every mcp-graphql tool call — the bot sees exactly what the user may see.
**DO NOT change this to a service credential**; it is the governance guarantee that
the AI cannot become a bypass channel around field-level policy. This ticket adds a
code comment + test asserting the passthrough so nobody "fixes" it later.

The router now runs **transparent redact mode**: `query-graphql` tool results for a
user lacking a role return HTTP 200 with the governed fields absent from `data` and a
machine-readable report in:

    extensions.governance = { redactedFields: ["Rating.numVotes"],
                              roles: [...], revision: N }

Without guidance the model may silently omit the value, speculate, or re-query. With
guidance it becomes the best possible explainer of governance.

## Tasks

1. System prompt: when a tool result contains `extensions.governance.redactedFields`,
   the assistant MUST (a) name the restricted field(s) in plain language ("vote counts
   are restricted for your role"), (b) never estimate or infer their values, (c) offer
   what IS accessible (e.g. `averageRating`), and (d) mention that a graph admin can
   grant access.
2. SSE: extend the `tool` event payload with `governance: { redactedFields }` when
   present, so the chat UI can badge the message with the restricted treatment
   (DES-8 vocabulary) in real time while the answer streams.
3. Retry hygiene: a redacted field is not an error — the model must not re-query
   hoping for a different outcome (prompt guidance; optionally strip-and-dedupe at
   the tool layer if the model proves stubborn).
4. Regression guard: test asserting the mcp-graphql Authorization header is the
   requesting user's token, not a service identity.

## Acceptance criteria

- As a user with no mapped persona: "how many votes does Game of Thrones have?" →
  the streamed answer names the rating it can see and clearly flags vote counts as
  restricted for the user's role; the chat UI shows the governance badge on the tool
  event. No hallucinated numbers (unit-test the prompt contract with a mocked tool
  result; record one live check on the PR).
- After an admin maps the user's email to `analyst` in the governance console (no
  redeploys anywhere): the same question answers with the real number within one
  policy poll interval (~15s).
- The token-passthrough regression test exists and fails if the tool transport stops
  using the requesting user's token.
- A redacted tool result triggers at most one query per user question (no retry
  loops), verified by a unit test counting tool invocations.

## Files expected to change

- chat backend (system prompt, SSE tool event payload, passthrough test)
- chat UI (governance badge on tool events, reusing IMDB-14's restricted treatment)

## Log

- **governance-platform** (external) — filed with the platform work already live
  (redact mode + extensions.governance verified on the deployed router). Depends on
  IMDB-14 only for the shared restricted-treatment vocabulary in the chat UI; the
  backend tasks (1, 3, 4) have no dependency beyond the chat scaffold and can land
  first.
- **product-owner** — triaged. Dependencies verified: IMDB-10 (PR #5) and IMDB-11
  (PR #9) are both merged. Status → **`needs-design`**, but narrowly: the backend
  scope (system-prompt contract, SSE `tool` event `governance` payload, retry
  hygiene, token-passthrough regression guard) is fully settled by this ticket plus
  the IMDB-10 contract and needs no design or architecture pass. What is
  underspecified is the **streamed governance badge in the chat transcript**:
  DES-7 (the approved chat spec) renders streamed text only — it defines no
  tool-event display at all — and DES-8 defines `RestrictedValue` as an inline pill
  occupying a replaced value's line box, not a message-level badge on a streaming
  reply. "Badge the message with the DES-8 vocabulary" therefore has no approved
  answer for where the badge sits, when it appears mid-stream, or its copy. Designer
  ask (small DES-7 addendum reusing DES-8's vocabulary): placement of the governance
  badge on an assistant message whose tool call was redacted, its appearance timing
  during streaming, copy, and multi-redaction handling. Once that addendum is
  approved and linked via `design:`, this flips to `ready-for-dev` as one ticket —
  the backend and UI halves ship together as the demo slice, and the AC wording
  ("the chat UI shows the governance badge on the tool event") already binds them.
  Note for the developer, echoing the filer: the user-token passthrough on
  mcp-graphql calls is the governance guarantee — task 4's regression test is
  non-negotiable scope.
