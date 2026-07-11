/**
 * Composer (DES-7): a single-line textarea that grows to 5 lines; Enter sends,
 * Shift+Enter newlines. Send is disabled while empty or while a reply is in
 * flight (one exchange at a time — never queued). After an auth rejection the
 * whole composer is disabled until a send succeeds after re-auth.
 */
import { useState } from 'react';

const MAX_ROWS = 5;
const LINE_HEIGHT_PX = 20;

export default function ChatComposer({ onSend, inFlight, disabled, textareaRef }) {
  const [value, setValue] = useState('');

  const canSend = !disabled && !inFlight && value.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
    const el = textareaRef?.current;
    if (el) el.style.height = '';
  };

  const grow = (el) => {
    // Auto-grow up to 5 lines, then scroll inside the textarea.
    el.style.height = 'auto';
    if (el.scrollHeight > 0) {
      el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX + 16)}px`;
    }
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        ref={textareaRef}
        className="chat-composer__input"
        rows={1}
        placeholder="Ask about the data"
        aria-label="Ask about the data"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          grow(event.target);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <button type="submit" className="chat-composer__send" aria-label="Send" disabled={!canSend}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M1.5 8 14 2 9.5 8 14 14 1.5 8Z" fill="currentColor" />
        </svg>
      </button>
    </form>
  );
}
