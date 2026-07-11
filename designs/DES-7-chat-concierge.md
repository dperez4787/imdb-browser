---
id: DES-7
title: Chat concierge — docked panel beside the browsing surface
status: approved
tickets: [IMDB-11, IMDB-16]
---

## Intent

The assistant is a concierge, not a kiosk: it lives in a **right-docked panel that the
content reflows around**, never an overlay that covers what you're looking at —
because the questions worth asking ("which of these did Coppola direct?") arise *while
browsing*, and an answer you can read next to the grid beats one that replaces it. It
is ever-present (TopBar button + `Cmd/Ctrl+/` from any signed-in view), persists open
across navigation, and keeps one session-scoped conversation. Answers come from the
IMDB-10 backend (which does its own GraphQL reasoning); the browser talks **only** to
that backend, carrying the Firebase ID token, and renders whatever transport the
IMDB-10 contract decides — this spec defines the rendering for both the streaming and
non-streaming outcome so the developer follows the contract, not a guess.

## Layout

### Open panel (desktop ≥1080px — content reflows, nothing is covered)

```
┌────────────────────────────────────────────┬───────────────────────┐
│ MARQUEE ● [ 🔍 omnibox ]            💬(DP) │ Concierge      ⟳  ✕   │
├────────────────────────────────────────────┤                       │
│                                            │  ┌─────────────────┐  │
│   <routed view, reflowed to               >│  │ Which 70s crime │  │ ← user,
│    the remaining width — grid              │  │ films rate >9?  │  │   right
│    columns adapt per DES-3's               │  └─────────────────┘  │
│    breakpoints>                            │  Two stand out:       │ ← assistant,
│                                            │  The Godfather (1972) │   left, plain
│                                            │  ★9.2 and The         │   background,
│                                            │  Godfather Part II…   │   markdown
│                                            │                       │
│                                            │  ▍                    │ ← streaming
│                                            │                       │   caret
│                                            ├───────────────────────┤
│                                            │ ┌───────────────────┐ │
│                                            │ │ Ask about the data│ │
│                                            │ └───────────────[➤]─┘ │
└────────────────────────────────────────────┴───────────────────────┘
```

- Panel: fixed 380px, full height under the TopBar, hairline left border, same
  surface palette (DES-1). Header: title "Concierge", `⟳ New chat` (clears the
  conversation after a confirm-free single click — cheap to start over), `✕` close.
- Messages: user bubbles right (raised card background), assistant messages left
  with no bubble (plain text on the surface — the assistant is the room, the user is
  the guest). Assistant messages render markdown: paragraphs, lists, bold, inline
  code, and links (links to in-app routes navigate in-app; the panel stays open).
- Composer: single-line textarea that grows to 5 lines, send button; Enter sends,
  Shift+Enter newlines. Send disabled while empty or while a reply is in flight.
- Below 1080px: the panel overlays from the right (content doesn't reflow) with a
  scrim; below 720px it is a full-screen sheet. Same component, same conversation.

### States

```
First-run / empty conversation:
│   Concierge                              ⟳  ✕  │
│                                                │
│        Ask anything about the data —           │
│        it answers with live queries.           │
│                                                │
│    [ What are the highest-rated 90s            │
│      sci-fi movies? ]                          │
│    [ Which directors have the most             │
│      titles this decade? ]                     │
│    [ Who acted in both Heat and The            │
│      Godfather? ]                              │
│                                                │
        Three static example prompts (fixed strings in
        source, chosen here); clicking one sends it.

In-flight (contract is non-streaming, or stream not yet begun):
        Assistant slot shows a three-dot typing shimmer.
In-flight (contract streams):
        Text renders progressively with a caret ▍; the panel
        auto-scrolls only if the user is already at the bottom.

Backend error (5xx / network):
│  ⚠ The concierge couldn’t answer.              │
│  [ Retry ]                                     │
        Retry re-sends the same message; the failed
        exchange is replaced, not duplicated.

Auth rejection (401 — e.g. expired token):
│  ⚠ Your session expired. Sign in again to      │
│  keep chatting.                                │
        No retry button — resolving auth is the fix; the
        composer stays disabled until a send succeeds after
        re-auth (AuthGate handles the actual re-sign-in).

Long conversation:   scrolls; a “↓ latest” pill appears when
                     scrolled up and a new message arrives.
```

## Components

- `ChatPanel` — the docked/overlay/sheet container; open state + width behavior.
- `ChatToggle` — the TopBar button (DES-1); shows an amber dot when a reply arrives
  while the panel is closed.
- `MessageList` — scroll region; auto-scroll-when-at-bottom rule; "↓ latest" pill.
- `UserMessage` / `AssistantMessage` — the two message renderings (assistant renders
  markdown; sanitized, no raw HTML).
- `TypingIndicator` — three-dot shimmer.
- `ToolIndicator` — one muted line per SSE `tool` event ("Querying the graph…"),
  interleaved with streaming text in the order emitted; renders **only while the
  reply streams** — committed messages keep text only. (Adopted into this inventory
  from the IMDB-10 SSE contract; built under IMDB-11.)
- `GovernanceBadge` — the restricted-fields footer on an assistant message; see
  *Addendum — streamed governance badge* below.
- `ChatComposer` — textarea + send; Enter/Shift+Enter handling.
- `ChatErrorNotice` — error / auth-rejection rendering with the retry rule above.
- `EmptyChat` — greeting + the three example prompts.
- `useChatSession` — hook: message array, send, retry, in-flight flag; speaks only
  to the IMDB-10 backend client module with the Firebase ID token attached.

## Behavior

- **Ever-present**: the `ChatToggle` is visible on every signed-in view;
  `Cmd/Ctrl+/` toggles the panel; `Esc` closes it when focus is inside it. Opening
  focuses the composer; closing returns focus to the toggle.
- The panel **persists across in-app navigation** — navigating with the panel open
  keeps it open with the conversation intact.
- **History model**: one conversation per browser session, held in memory; reload
  starts fresh; `⟳ New chat` starts fresh explicitly. (If the IMDB-10 contract adds
  server-side history, that is a later ticket — this spec deliberately keeps v1
  client-held.)
- **Transport**: every send goes to the chat backend only, with the current Firebase
  ID token — observable as zero requests to any Anthropic endpoint and no Anthropic
  key in the served bundle. If the IMDB-10 contract streams, render progressive text
  + caret; if it doesn't, render the typing indicator until the full reply. Both are
  specified above; the developer implements whichever the contract states, changing
  only `useChatSession` internals.
- Sending: optimistic — the user message appears immediately; the assistant slot
  enters in-flight. One in-flight exchange at a time (composer disabled, not queued).
- Retry replaces the failed assistant slot; the conversation never shows duplicate
  user messages from retrying.
- Keyboard/focus: the panel is a normal region, not a focus trap on desktop (Tab can
  leave it); the mobile sheet does trap focus. Message list is readable by screen
  readers as a log (`aria-live="polite"` on new assistant content).
- Signed out, nothing chat-related renders (AuthGate wraps everything).

## Data needs

None from the GraphQL router — the panel's only data source is the IMDB-10 chat
backend (endpoint shape, streaming or not, and history payload per the API contract
recorded for IMDB-10 in `docs/architecture.md`; this spec renders either transport).
The Firebase ID token comes from the DES-1/IMDB-2 auth module. Example prompts are
static strings shipped in the frontend (listed above).

---

## Addendum — streamed governance badge (IMDB-16)

### Intent

The router runs transparent redact mode: a tool result for a user lacking a role
comes back healthy with governed fields absent and
`extensions.governance.redactedFields` naming them; the backend forwards that on the
SSE `tool` event as `governance: { redactedFields }` (IMDB-16). Two voices then tell
the user: the assistant's **prose** explains in plain language (the prompt contract
makes it name restricted fields and never guess values), and this **badge** is the
machine corroboration — the exact coordinates the policy withheld, pinned quietly to
the message. The badge corroborates; it never headlines. It sits at the *foot* of the
message, muted and static, and in the default case — no governance on any tool event —
**it does not exist at all**: no DOM, no reserved space, no cost.

### Layout

```
While streaming:                          Committed (tool lines gone —
                                          they are draft-only):
│ ⚙ Querying the graph…        │
│                              │          │ The Godfather averages 9.2 │
│ The Godfather averages 9.2   │          │ stars, but vote counts are │
│ stars, but vote counts are   │          │ restricted for your role…  │
│ restricted for your role…▍   │          │                            │
│                              │          │ ▨🔒▨ Restricted for your   │
│ ▨🔒▨ Restricted for your     │          │ role: Rating.numVotes      │
│ role: Rating.numVotes        │          │                            │
```

- **Position: always the last line of the assistant message** — below the streaming
  text and caret while in flight, the final line of the committed message after.
  Appended, never inserted above: text the user has already read never shifts down
  (the same reason the message list only ever grows at the bottom).
- **Anatomy**: a mini redaction swatch — DES-8's pill recipe verbatim (45° hatch of
  `#262a33` over `#181b22`, 1px border, 3px radius, centered ≈10px muted lock) at a
  fixed `2em` width — leading a 12px muted `#9aa0a6` line:
  `Restricted for your role:` followed by the coordinates in inline-code style,
  first-seen order, at most 3, then `+N more`. This is DES-8's vocabulary *adapted*:
  the hatch+lock swatch is the recognizable mark, but this is an annotation line, not
  an inline value pill — nothing here occupies a replaced value's line box.
- **Deliberate divergence from DES-8, stated**: DES-8 never shows coordinates to
  users because its call sites have human labels. Chat has no call site — the
  assistant's prose *is* the human-language layer, and the badge's raw coordinates
  (`Rating.numVotes`) are precisely its value: proof the restriction is policy, not
  hallucination. Prose says it in words; the badge says it in ground truth.
- **Static, always** — no shimmer, no animation, ever. Same discriminator logic as
  DES-8: the animated thing nearby (the `ToolIndicator` spark, the streaming caret)
  means *activity*; the hatch means *withheld*. **No amber.**

### Timing and aggregation

```
t0  user sends "how many votes does Game of Thrones have?"
t1  tool event {name: query-graphql, governance:{redactedFields:[Rating.numVotes]}}
        → badge appears NOW, foot of the (still-empty) draft message,
          directly under the tool line
t2  text streams above it: "…vote counts are restricted for your role…"
t3  a second tool call reports Name.birthYear
        → the SAME badge grows its list in place; never a second badge
t4  stream completes; tool lines drop (draft-only), badge persists as the
    committed message's last line
```

- The badge appears the moment the **first** `tool` event with a non-empty
  `redactedFields` arrives — mid-stream, usually before any text.
- **One badge per assistant message**, holding the **union** of `redactedFields`
  across all of that exchange's tool events (up to the contract's 8), deduped,
  first-seen order. Later governance events update the existing badge's list in
  place; the badge never changes position or duplicates.
- `governance` absent or `redactedFields` empty → treated as no governance; an empty
  badge is never rendered.
- The badge **persists in the transcript** after streaming — the corroboration must
  survive scrollback (tool lines don't; that is why the badge is not a tool-line
  decoration). Retry discards the draft and its badge with it (per the base spec's
  replace-not-duplicate rule); a committed message keeps its badge until `⟳ New chat`.

### Tooltip (hover and keyboard focus — the DES-8 affordance, adapted copy)

```
   ▨🔒▨ Restricted for your role: Rating.numVotes +2 more
   ┌────────────────────────────────────────────┐
   │ Restricted                                 │
   │ Your role isn’t granted these fields:      │
   │ Rating.numVotes, Name.birthYear,           │
   │ Name.deathYear. The concierge answered     │
   │ without them — it sees exactly what you    │
   │ see. If access is granted, ask again and   │
   │ the real values appear.                    │
   └────────────────────────────────────────────┘
```

Same surface recipe as DES-8's tooltip (raised card, hairline border, max-width
280px, hover **and** keyboard focus, `Esc` dismisses, never opens on its own). The
copy carries the governance guarantee — *it sees exactly what you see* — and the
demo's payoff: a grant needs only a re-ask, no reload. The tooltip always lists the
**full** coordinate set, which is where an overflowed `+N more` resolves.

### States

```
Default (no governance):   nothing renders — no DOM, no reserved space.
                           This is the overwhelmingly common case and it
                           must cost zero.
Appears mid-stream:        foot of the draft message at t1 above; joining
                           a streaming message is ordinary growth, not a
                           layout jump.
Grows mid-stream:          list updates in place; position fixed.
Committed:                 persists as the message's last line.
Retry / stream error:      discarded with the draft; never orphaned.
Roles granted live:        a new question streams clean → its message
                           simply has no badge. Old messages keep theirs —
                           they were true when answered; the transcript
                           does not rewrite history.
```

### Components

- `GovernanceBadge` — props `redactedFields: string[]` (already unioned/deduped);
  renders swatch + line + tooltip; emits `data-coordinates="Rating.numVotes,…"` for
  tests. Focusable (`tabIndex=0`), not a button — Enter/Space do nothing, it never
  navigates.
- `AssistantMessage` / the draft renderer — both render `GovernanceBadge` as the
  final child when their message's `governance` is non-null.
- `useChatSession` — `onTool` gains the optional second argument
  (`{ redactedFields }`); the hook unions into the draft and carries
  `governance: { redactedFields } | null` onto the committed assistant message.

### Behavior (acceptance-quotable)

- A `tool` event with non-empty `governance.redactedFields` renders the badge at the
  foot of the in-flight assistant message before the answer finishes streaming; the
  badge remains on the committed message.
- Multiple redacted tool calls in one exchange produce exactly one badge whose list
  is the deduped union; a message whose tool calls carry no governance renders no
  badge and reserves no space.
- Screen reader: accessible text `"Restricted for your role: Rating.numVotes,
  Name.birthYear."` — the swatch is `aria-hidden` decoration, the tooltip is
  `aria-hidden` presentation (its meaning is the accessible text). The badge arrives
  as part of the message content the base spec already announces via
  `aria-live="polite"` — **no separate live region, no double announcement.**
- Focus order: the badge follows the message's content (links, if any) in the tab
  order; focus shows the shared amber ring and opens the tooltip; blur or `Esc`
  closes it.
- The badge never suppresses, delays, or restyles the assistant's own explanation —
  prose and badge are independent; if the model under-explains, the badge still
  renders (it is driven by the event, never by parsing the prose).

### Data needs

None from the GraphQL router. One addition to the chat SSE contract (IMDB-16 task 2):
the `tool` event may carry `governance: { redactedFields: string[] }` alongside
`name`, forwarded verbatim from the router's `extensions.governance.redactedFields`
on that tool call's result. `roles` and `revision` from that extension stay out of
the transcript — who you are is the TopBar role badge's job (DES-1 addendum), not the
message's.
