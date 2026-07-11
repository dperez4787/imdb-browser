/**
 * The concierge container (DES-7): on desktop (≥1080px) a right-docked 380px
 * column the content REFLOWS around — never an overlay covering the view.
 * Below 1080px the same component overlays from the right behind a scrim;
 * below 720px it is a full-screen sheet (the sheet traps focus; the docked
 * panel is a normal region Tab can leave). The switch is pure CSS — same
 * component, same conversation.
 *
 * Keyboard/focus: opening focuses the composer (effect below); Esc inside the
 * panel closes it, and closing (any path) returns focus to the TopBar toggle
 * via ChatProvider.
 */
import { useEffect } from 'react';

import ChatComposer from './ChatComposer.jsx';
import EmptyChat from './EmptyChat.jsx';
import MessageList from './MessageList.jsx';
import { useChat } from './ChatProvider.jsx';

export default function ChatPanel() {
  const { open, closePanel, composerRef, session } = useChat();
  const { messages, draft, inFlight, error, send, retry, reset } = session;

  // Opening focuses the composer. The panel only mounts while open, so this
  // runs exactly on open.
  useEffect(() => {
    if (open) composerRef.current?.focus();
  }, [open, composerRef]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
      return;
    }
    // The mobile sheet traps focus (DES-7); the docked panel does not.
    if (event.key === 'Tab' && window.matchMedia?.('(max-width: 719px)').matches) {
      const focusables = event.currentTarget.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), a[href]',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const empty = messages.length === 0 && !draft && !error;

  return (
    <div className="chat-dock">
      {/* Overlay widths only (CSS hides it when docked); click closes. */}
      <div className="chat-dock__scrim" aria-hidden="true" onClick={closePanel} />
      <aside className="chat-panel" aria-label="Concierge" onKeyDown={onKeyDown}>
        <header className="chat-panel__header">
          <h2 className="chat-panel__title">Concierge</h2>
          <button type="button" className="chat-panel__action" aria-label="New chat" title="New chat" onClick={reset}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M13.6 8a5.6 5.6 0 1 1-1.64-3.96M13.6 1.6v3.2h-3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="chat-panel__action"
            aria-label="Close concierge"
            title="Close"
            onClick={closePanel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {empty ? (
          <EmptyChat onPrompt={send} />
        ) : (
          <MessageList messages={messages} draft={draft} error={error} onRetry={retry} />
        )}
        <ChatComposer
          onSend={send}
          inFlight={inFlight}
          disabled={error?.kind === 'auth'}
          textareaRef={composerRef}
        />
      </aside>
    </div>
  );
}
