---
id: DES-7
title: Chat concierge — docked panel beside the browsing surface
status: approved
tickets: [IMDB-11]
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
