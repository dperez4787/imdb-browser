/**
 * The conversation scroll region (DES-7): committed messages, then the
 * in-flight assistant slot (tool indicator lines + progressive text + caret,
 * or the typing shimmer before any text arrives), then the error notice.
 *
 * Scroll rules: auto-scroll to the bottom only while the user is already at
 * the bottom; when scrolled up and new content arrives, show the "↓ latest"
 * pill instead. role="log" makes new assistant content polite live-region
 * output for screen readers.
 */
import { useEffect, useRef, useState } from 'react';

import AssistantMessage from './AssistantMessage.jsx';
import ChatErrorNotice from './ChatErrorNotice.jsx';
import GovernanceBadge from './GovernanceBadge.jsx';
import ToolIndicator from './ToolIndicator.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import UserMessage from './UserMessage.jsx';

const NEAR_BOTTOM_PX = 32;

export default function MessageList({ messages, draft, error, onRetry }) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  const parts = draft?.parts ?? [];
  const lastPart = parts[parts.length - 1];
  // Streamed text renders on the text part; the shimmer covers "no text yet"
  // and "text paused for a tool call".
  const showTyping = draft && (!lastPart || lastPart.type === 'tool');

  // One key that changes whenever anything below could have grown — including
  // the governance badge appearing or growing its list mid-stream.
  const contentKey = [
    messages.length,
    parts.length,
    lastPart?.type === 'text' ? lastPart.text.length : 0,
    draft?.governance?.redactedFields?.length ?? 0,
    error ? 'error' : '',
  ].join(':');

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setShowLatest(true);
    }
  }, [contentKey]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (atBottom) setShowLatest(false);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowLatest(false);
  };

  return (
    <div className="chat-messages-wrap">
      <div className="chat-messages" role="log" aria-live="polite" ref={scrollRef} onScroll={onScroll}>
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} content={m.content} />
          ) : (
            <AssistantMessage key={m.id} content={m.content} governance={m.governance} />
          ),
        )}
        {parts.map((part, i) =>
          part.type === 'tool' ? (
            <ToolIndicator key={`part-${i}`} name={part.name} />
          ) : (
            <AssistantMessage key={`part-${i}`} content={part.text} streaming={i === parts.length - 1} />
          ),
        )}
        {showTyping && <TypingIndicator />}
        {/* Governance badge: the foot of the in-flight assistant message. Text
            streams ABOVE it (the shimmer marks where), so it stays the last
            line; on commit AssistantMessage renders its own (DES-7 addendum). */}
        {draft?.governance?.redactedFields?.length ? (
          <GovernanceBadge redactedFields={draft.governance.redactedFields} />
        ) : null}
        {error && <ChatErrorNotice error={error} onRetry={onRetry} />}
      </div>
      {showLatest && (
        <button type="button" className="chat-latest" onClick={jumpToLatest}>
          ↓ latest
        </button>
      )}
    </div>
  );
}
