/**
 * The conversation state machine behind the concierge (DES-7 `useChatSession`):
 * message array, send/retry/reset, the in-flight streaming draft, and the
 * error state. Speaks ONLY to the chat backend through chatApi.js.
 *
 * History model per the design: one conversation per browser session, held in
 * memory here; a reload (or sign-out, which unmounts the gate) starts fresh;
 * "New chat" starts fresh explicitly. Each send re-sends the client-held
 * history, capped to the contract's 20 messages / 16 KB inside chatApi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../AuthContext.jsx';
import { sendChat } from './chatApi.js';

let idCounter = 0;
const nextId = () => `msg-${(idCounter += 1)}`;

export function useChatSession() {
  const { user } = useAuth();

  // Committed conversation: [{ id, role: 'user'|'assistant', content }].
  const [messages, setMessages] = useState([]);
  // The in-flight assistant slot, or null. `parts` preserves stream order so
  // tool-call indicator lines interleave with progressive text exactly as the
  // backend emitted them: [{ type: 'text', text } | { type: 'tool', name }].
  const [draft, setDraft] = useState(null);
  const [inFlight, setInFlight] = useState(false);
  // { kind, message } — kind 'auth' renders the session-expired state (no
  // retry button); everything else renders the error state with Retry.
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  // Run one exchange: `history` already ends with the user message being
  // answered. Retry re-runs with the same history — the failed assistant slot
  // is replaced and the user message is never duplicated (DES-7).
  const run = useCallback(async (history) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setInFlight(true);

    // Accumulate locally (not from state) so the committed message is exactly
    // what streamed, regardless of render batching.
    const parts = [];
    const publish = () => {
      if (!mountedRef.current) return;
      setDraft({ parts: parts.map((p) => ({ ...p })) });
    };
    publish();

    try {
      await sendChat({
        messages: history.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onText: (delta) => {
          const last = parts[parts.length - 1];
          if (last?.type === 'text') last.text += delta;
          else parts.push({ type: 'text', text: delta });
          publish();
        },
        onTool: (name) => {
          parts.push({ type: 'tool', name });
          publish();
        },
      });

      if (!mountedRef.current || controller.signal.aborted) return;
      const content = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n\n')
        .trim();
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'assistant',
          content: content || 'I could not come up with an answer — try rephrasing?',
        },
      ]);
      setDraft(null);
      setInFlight(false);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || err?.name === 'AbortError') return;
      // Partial streamed text is discarded: retry replaces the failed
      // assistant slot with a fresh answer, never appends to a torn one.
      setDraft(null);
      setInFlight(false);
      setError({
        kind: err?.kind ?? 'network',
        message: err?.message ?? 'Something went wrong.',
      });
    }
  }, []);

  const send = useCallback(
    (text) => {
      const content = text.trim();
      if (!content || inFlight) return; // one in-flight exchange at a time
      const next = [...messages, { id: nextId(), role: 'user', content }];
      setMessages(next); // optimistic: the user message appears immediately
      run(next);
    },
    [messages, inFlight, run],
  );

  const retry = useCallback(() => {
    if (inFlight || messages.length === 0) return;
    if (messages[messages.length - 1].role !== 'user') return;
    run(messages);
  }, [messages, inFlight, run]);

  // ⟳ New chat — single click, no confirm (cheap to start over, per DES-7).
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setDraft(null);
    setInFlight(false);
    setError(null);
  }, []);

  // Auth-rejection recovery (DES-7): the composer stays disabled until a send
  // succeeds after re-auth. AuthGate owns the actual re-sign-in; when the
  // signed-in user changes while an auth error is showing, retry the failed
  // exchange automatically — its success is what re-enables the composer.
  const prevUserRef = useRef(user);
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const errorRef = useRef(error);
  errorRef.current = error;
  useEffect(() => {
    const prev = prevUserRef.current;
    prevUserRef.current = user;
    if (user && user !== prev && errorRef.current?.kind === 'auth') {
      retryRef.current();
    }
  }, [user]);

  return { messages, draft, inFlight, error, send, retry, reset };
}
