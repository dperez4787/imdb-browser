---
id: IMDB-16
title: Chat — flag governed fields conversationally, never guess them
status: done
owner: product-owner
design: designs/DES-7-chat-concierge.md
depends-on: [IMDB-10, IMDB-11]
branch: "imdb-16-chat-governance-awareness"
pr: "https://github.com/dperez4787/imdb-browser/pull/21"
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
- **ui-ux-designer** — design settled: DES-7 revised in place with **"Addendum —
  streamed governance badge (IMDB-16)"** (`designs/DES-7-chat-concierge.md`); the
  addendum also formally adopts `ToolIndicator` (built under IMDB-11) into DES-7's
  inventory and records that tool lines are draft-only. The PO's open questions,
  answered there: *placement* — `GovernanceBadge` renders as the **last line of the
  assistant message** (appended below the streaming text/caret, so already-read text
  never shifts) and **persists on the committed message** — it cannot ride the tool
  line, which drops at commit; *timing* — appears the moment the first `tool` event
  with non-empty `governance.redactedFields` arrives, mid-stream; *copy* —
  DES-8-adapted mark (static hatch swatch + lock at 2em, never animated, no amber)
  leading muted 12px `Restricted for your role:` + coordinates in code style (a
  stated, deliberate divergence from DES-8's never-show-coordinates rule: chat has
  no call-site label, the prose is the human layer, and the raw coordinates are the
  corroboration), tooltip on hover+focus with full list and the "it sees exactly
  what you see / ask again after a grant" copy; *multi-redaction* — one badge per
  message, deduped first-seen **union** across all (≤8) tool events, growing in
  place, never duplicated. Default no-governance case renders nothing — no DOM, no
  reserved space. The AC phrase "the chat UI shows the governance badge on the tool
  event" is satisfied by this message-foot badge driven by the tool event; quote the
  addendum's Behavior section for the verifiable wording. Status →
  **`ready-for-dev`**; `design:` set.
- **developer** — claimed; branch `imdb-16-chat-governance-awareness`. Implemented
  all four platform tasks plus the DES-7-addendum badge. Backend (`app/chat/`):
  - **Task 1 (system prompt)** — `config.js` `SYSTEM_PROMPT` gained a governance
    rule: on `extensions.governance.redactedFields` name the field(s) plainly, never
    estimate/infer/guess the values, still answer with what IS available, and note a
    graph admin can grant access.
  - **Task 2 (SSE)** — new `governance.js#extractRedactedFields` parses the
    coordinates out of the `query-graphql` tool result (mcp-graphql returns the
    router's redact-mode JSON — HTTP 200, no `errors` — as text on its success path).
    `anthropic.js` now emits the `tool` event *after* the call so it can carry the
    additive `governance: { redactedFields }` (omitted when nothing was redacted);
    existing tool-event order/tests unchanged.
  - **Task 3 (retry hygiene)** — a redaction is fed back as `is_error: false`, so the
    loop never forces a re-query; prompt reinforces "do not re-run … will not change
    within this turn". Unit test counts exactly one tool call for a redacted answer.
  - **Task 4 (NON-NEGOTIABLE passthrough guard)** — strengthened the code comment on
    `mcp.js#buildMcpEnv` (governance guarantee: user token, never a service identity)
    and added `governance.test.js` regression test asserting the mcp-graphql
    `Authorization` header is the requesting user's forwarded Firebase token, varies
    per user, and matches no service/router/API-key pattern.
  Frontend (`app/frontend/src/chat/`): new `GovernanceBadge.jsx` (swatch + muted
  `Restricted for your role:` line + code-style coordinates, ≤3 then `+N more`,
  hover/focus tooltip with the "it sees exactly what you see / ask again after a
  grant" copy, SR text, `data-coordinates`, focusable non-button, **zero DOM when no
  governance**); `useChatSession` unions `onTool`'s new `{ redactedFields }` arg
  first-seen/deduped and carries `governance` onto the committed message;
  `chatApi.js` forwards it; `AssistantMessage`/`MessageList` render it as the
  message's last line (draft foot below the streaming caret, persisted on commit);
  appended `styles.css` `.chat-governance` section (static hatch, no amber, amber ring
  on focus only).
  Verified: `npm ci && npm test` green in both packages — chat **56 pass** (11 new:
  governance framing with faked MCP, the passthrough guard, prompt assertions, retry
  hygiene), frontend **350 pass** (11 new: badge lifecycle absent→appears→grows→
  persists, zero-DOM, tooltip, SSE forwarding); `vite build` green. **Not verified:**
  the live end-to-end (real router redaction + model prose + the analyst-grant flow)
  is deferred per user directive — it needs a real `ANTHROPIC_API_KEY` and an
  interactive Google sign-in; no key was placed anywhere. Draft PR **#21**
  (https://github.com/dperez4787/imdb-browser/pull/21) opened; status →
  **`in-review`**. Left as a draft for the tester (`gh pr ready` is theirs).
- **tester** — verified on `imdb-16-chat-governance-awareness` (PR #21), clean
  checkouts: `npm ci && npm test` → chat **58 pass / 0 fail** (exit 0), frontend
  **351 pass / 16 skipped / 0 fail** (exit 0; the 16 skipped are the pre-existing
  live-router suites gated on a `TOKEN` env var, expected under the deferral);
  `vite build` green. Per-criterion verdict:
  - **AC 1 (redacted question: prose contract + badge + no hallucinated numbers)
    — PASS (unit/wire level), live check DEFERRED.** Prompt contract asserted
    (names fields plainly / NEVER estimate-infer-guess / offers what IS available
    / admin can grant — `governance.test.js`); SSE `tool` frame carries
    `governance.redactedFields` (emit seam + tester wire-level frame test through
    real HTTP in `acceptance.test.js`, which also proves `roles`/`revision` never
    reach the stream); badge lifecycle driven through the real components:
    absent → appears mid-stream on the first redacted tool event → grows deduped
    in place → persists on commit → zero DOM when clean → discarded with a failed
    draft (`ChatPanel.test.jsx`, `GovernanceBadge.test.jsx`). The "record one
    live check on the PR" clause is **not verified** — needs a real
    `ANTHROPIC_API_KEY` + interactive Google sign-in; deferred to the testing
    period per the 2026-07-11 directive (steps on the PR).
  - **AC 2 (analyst grant answers with the real number within ~15s) — NOT
    VERIFIED (live-only), client half PASS.** Requires the governance console
    and a live grant flip. What is agent-verifiable passed: the backend is
    stateless with per-request token passthrough (nothing caches a denial), and
    the tester history test proves a post-grant clean answer renders no badge
    while the earlier message keeps its badge.
  - **AC 3 (token-passthrough regression test) — PASS, independently proven.**
    Mutation A (service credential inside `buildMcpEnv`) → developer's guard goes
    red (2 failures). Mutation B (HEADERS overridden at the `StdioClientTransport`
    env) → the entire suite stayed **green**: the guard did not watch the wire.
    Gap closed with tester `mcp.passthrough.test.js`: spawns the real mcp-graphql
    child via the real `createMcpSession` against a loopback capture server and
    asserts the Authorization header on the wire is `Bearer <requesting user's
    token>`, varies per user, matches no service pattern; re-ran Mutation B → red
    (`actual: 'Bearer imdb-router-service-account-token'`). Both mutations
    reverted; final tree is clean code + green guards.
  - **AC 4 (at most one query per redacted question) — PASS.** Unit test counts
    exactly one tool call for a redacted answer; the tool_result is fed back
    `is_error: false`; prompt forbids re-querying within the turn.
  Conventions checked: no `fetch()` outside the boundary modules, no committed
  secrets, badge is presentation-only. Status → **`done`**; PR #21 taken out of
  draft (`gh pr ready`) — **merge should wait for the live testing period** to
  record the AC-1 live check and the AC-2 grant flow (exact steps on the PR).
