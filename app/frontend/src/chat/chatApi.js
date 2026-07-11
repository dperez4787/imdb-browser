/**
 * The single place that knows the chat backend exists — the chat counterpart of
 * `auth.js` (one module owns the boundary; no fetch() inside components). Every
 * chat request goes to OUR backend only, carrying the signed-in user's Firebase
 * ID token from the auth boundary; the browser never talks to Anthropic and no
 * Anthropic key exists anywhere in this bundle.
 *
 * Wire contract (docs/architecture.md, "Chat backend API contract"):
 *   POST {CHAT_URL}/api/chat
 *     body    { messages: [{ role: "user"|"assistant", content }] }
 *             — full history, newest last, capped at 20 messages / 16 KB
 *     reply   Server-Sent Events, consumed with fetch + ReadableStream:
 *             text  {delta}            assistant text chunks
 *             tool  {name}             a GraphQL tool call is running
 *             done  {usage}            terminal success
 *             error {kind, message}    terminal failure (also used on the
 *                                      429 rate-limit stream)
 */
import { getIdToken } from '../auth.js';

// Chat backend base URL. Production builds set VITE_CHAT_URL to the Cloud Run
// service; the default matches `npm start` in app/chat for local development.
function chatUrl() {
  return (import.meta.env?.VITE_CHAT_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
}

// The contract's request caps, enforced client-side so a long session keeps
// working instead of tripping the server's 400/413.
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Every failure from this module is a ChatApiError whose `kind` the UI
 * branches on (DES-7): 'auth' → the session-expired state (no retry button);
 * anything else → the error state with Retry. Server-sent `error` events keep
 * their own kind ('rate-limited', 'upstream', …).
 */
export class ChatApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ChatApiError';
    this.kind = kind;
  }
}

const encoder = new TextEncoder();

function bodyBytes(messages) {
  return encoder.encode(JSON.stringify({ messages })).length;
}

/**
 * Trim history to the newest slice that satisfies BOTH caps (20 messages,
 * 16 KB serialized body). The newest message is always kept — if it alone
 * exceeds the byte cap the server's 413 comes back as a normal error state
 * rather than us silently truncating what the user said.
 */
export function capHistory(messages) {
  let kept = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const next = [{ role: messages[i].role, content: messages[i].content }, ...kept];
    if (kept.length > 0 && (next.length > MAX_HISTORY_MESSAGES || bodyBytes(next) > MAX_BODY_BYTES)) {
      break;
    }
    kept = next;
  }
  return kept;
}

/**
 * Send one exchange to the chat backend and consume its SSE stream.
 *
 *   sendChat({ messages, signal, onText, onTool }) → Promise<{ usage }>
 *
 * - `messages`: the full client-held history, newest (user) message last.
 *   Capped here via capHistory before sending.
 * - `onText(delta)`  — called per `text` event, in stream order.
 * - `onTool(name, governance)` — called per `tool` event; `governance` is
 *   `{ redactedFields: string[] }` when the router redacted governed fields on
 *   that tool call (IMDB-16), else undefined. Additive to the IMDB-10 contract.
 * - Resolves on the `done` event; rejects with ChatApiError on everything
 *   else (auth rejection, HTTP error, server `error` event, malformed or
 *   truncated stream, network failure). An abort via `signal` rejects with
 *   the DOMException AbortError, which callers treat as "never mind".
 */
export async function sendChat({ messages, signal, onText, onTool }) {
  const token = await getIdToken();
  if (!token) {
    throw new ChatApiError('auth', 'Not signed in.');
  }

  let response;
  try {
    response = await fetch(`${chatUrl()}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages: capHistory(messages) }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ChatApiError('network', 'Could not reach the concierge backend.');
  }

  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    // Pre-stream rejection: 401 (invalid/expired token), 400/413 (caps),
    // 5xx. The rate-limit 429 is NOT this path — it streams an `error` event.
    if (response.status === 401 || response.status === 403) {
      throw new ChatApiError('auth', 'Your session expired.');
    }
    throw new ChatApiError('http', `The concierge backend answered ${response.status}.`);
  }

  return consumeSse(response.body, { onText, onTool });
}

/**
 * Parse an SSE byte stream (`event: <name>\ndata: <json>\n\n` frames) and
 * dispatch the contract's four event types. Exported for direct testing
 * against synthetic ReadableStreams.
 *
 * Robustness rules: frames may be split across arbitrary chunk boundaries;
 * CRLF is tolerated; frames with no data, unknown event names, or data that
 * is not valid JSON are skipped (a malformed frame must not kill the whole
 * answer). A stream that ends without a terminal `done`/`error` event rejects
 * as an interruption.
 */
export async function consumeSse(body, { onText, onTool } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (frame) => {
    const event = parseFrame(frame);
    if (!event) return null; // malformed or empty — skip
    switch (event.name) {
      case 'text':
        if (typeof event.data.delta === 'string') onText?.(event.data.delta);
        return null;
      case 'tool':
        // `governance` is forwarded verbatim (or undefined); useChatSession
        // unions/dedupes redactedFields and guards its shape (IMDB-16).
        if (typeof event.data.name === 'string') onTool?.(event.data.name, event.data.governance);
        return null;
      case 'done':
        return { done: { usage: event.data.usage } };
      case 'error':
        return {
          error: new ChatApiError(
            event.data.kind ?? 'upstream',
            event.data.message ?? 'Something went wrong while answering.',
          ),
        };
      default:
        return null; // unknown event type — ignore, per SSE convention
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
        const terminal = handle(frame);
        if (terminal?.done) return terminal.done;
        if (terminal?.error) throw terminal.error;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // The connection closed without `done` or `error` — a truncated answer.
  throw new ChatApiError('stream', 'The connection was interrupted before the answer finished.');
}

/** One SSE frame → { name, data } or null when it isn't a usable event. */
function parseFrame(frame) {
  let name = 'message';
  const dataLines = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine.startsWith('event:')) {
      name = rawLine.slice('event:'.length).trim();
    } else if (rawLine.startsWith('data:')) {
      dataLines.push(rawLine.slice('data:'.length).trimStart());
    }
    // Comments (`:`) and unknown fields (`id:`, `retry:`) are ignored.
  }
  if (dataLines.length === 0) return null;
  try {
    return { name, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null; // malformed JSON payload — skip the frame
  }
}
