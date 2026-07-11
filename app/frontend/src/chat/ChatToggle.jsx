/**
 * The TopBar chat affordance (DES-7): visible on every signed-in view, toggles
 * the concierge panel (also bound to Cmd/Ctrl+/ in ChatProvider). Shows an
 * amber dot when a reply arrived while the panel was closed.
 */
import { useChat } from './ChatProvider.jsx';

export default function ChatToggle() {
  const { open, unread, togglePanel, toggleRef } = useChat();

  return (
    <button
      ref={toggleRef}
      type="button"
      className="chat-toggle"
      aria-label={unread ? 'Concierge — new reply' : 'Concierge'}
      aria-expanded={open}
      aria-keyshortcuts="Meta+/ Control+/"
      title="Concierge (⌘/)"
      onClick={togglePanel}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
          d="M10 2.5c-4.4 0-8 2.9-8 6.5 0 2 1.1 3.8 2.9 5-.2 1-.7 1.9-1.5 2.6a.4.4 0 0 0 .3.7c1.7-.1 3.1-.7 4.1-1.4.7.1 1.4.2 2.2.2 4.4 0 8-2.9 8-6.5s-3.6-7.1-8-7.1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {unread && <span className="chat-toggle__dot" aria-hidden="true" />}
    </button>
  );
}
