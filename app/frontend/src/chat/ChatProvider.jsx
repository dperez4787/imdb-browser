/**
 * Shared concierge state (DES-7): the one chat session, the open/closed panel
 * state, the unread dot, and the keyboard/focus wiring that ties the TopBar
 * toggle to the panel. Mounted once in AppShell — inside the AuthGate, so
 * nothing chat-related exists signed out, and the session dies with sign-out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useChatSession } from './useChatSession.js';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const session = useChatSession();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);

  // Focus contract (DES-7): opening focuses the composer; closing returns
  // focus to the toggle. The refs cross the provider so ChatToggle and
  // ChatPanel don't need to know about each other.
  const toggleRef = useRef(null);
  const composerRef = useRef(null);

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(false);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  const togglePanel = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) {
        toggleRef.current?.focus();
        return false;
      }
      setUnread(false);
      return true;
    });
  }, []);

  // Ever-present keyboard affordance: Cmd/Ctrl+/ toggles from any signed-in view.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === '/' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel]);

  // Amber dot on the toggle when a reply lands while the panel is closed.
  const assistantCount = session.messages.filter((m) => m.role === 'assistant').length;
  const openRef = useRef(open);
  openRef.current = open;
  const prevAssistantCount = useRef(assistantCount);
  useEffect(() => {
    if (assistantCount > prevAssistantCount.current && !openRef.current) {
      setUnread(true);
    }
    prevAssistantCount.current = assistantCount;
  }, [assistantCount]);

  const value = useMemo(
    () => ({ open, unread, openPanel, closePanel, togglePanel, toggleRef, composerRef, session }),
    [open, unread, openPanel, closePanel, togglePanel, session],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (ctx === null) {
    throw new Error('useChat must be used within a <ChatProvider>');
  }
  return ctx;
}
