/**
 * Real cross-boundary check against the ACTUAL chat backend (app/chat) running
 * locally with no credentials — opt-in, because it needs that process up:
 *
 *   1. in app/chat:      npm start          (boots with no .env; /health → 200)
 *   2. in app/frontend:  CHAT_INTEGRATION=1 npx vitest run src/chat/chatApi.integration.test.jsx
 *
 * What this proves without any secret: the UI's real fetch path hits the real
 * backend, the backend 401s the unverifiable token BEFORE any Anthropic call,
 * and the panel renders the designed auth-rejection state (DES-7). The full
 * authenticated streamed conversation still needs a real ANTHROPIC_API_KEY +
 * Google sign-in and is NOT covered here.
 *
 * chatApi is NOT mocked in this file — only the auth boundary is, to supply a
 * syntactically-plausible-but-unverifiable token.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../AuthContext.jsx';
import ChatPanel from './ChatPanel.jsx';
import { ChatProvider } from './ChatProvider.jsx';
import ChatToggle from './ChatToggle.jsx';
import { getIdToken, subscribeToAuth } from '../auth.js';

vi.mock('../auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

const RUN = Boolean(process.env.CHAT_INTEGRATION);
const CHAT_URL = import.meta.env?.VITE_CHAT_URL ?? 'http://localhost:8080';

let emitAuth;

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToAuth.mockImplementation((listener) => {
    emitAuth = listener;
    return () => {};
  });
  // A structurally JWT-shaped token no verifier will accept.
  getIdToken.mockResolvedValue('eyJhbGciOiJSUzI1NiJ9.eyJmYWtlIjoidG9rZW4ifQ.c2lnbmF0dXJl');
});

describe.runIf(RUN)('against the real chat backend (no credentials)', () => {
  it('GET /health answers 200 without auth', async () => {
    const res = await fetch(`${CHAT_URL}/health`);
    expect(res.status).toBe(200);
  });

  it('an unverifiable token gets a real 401 and the panel renders the designed auth-rejection state', async () => {
    render(
      <AuthProvider>
        <ChatProvider>
          <ChatToggle />
          <ChatPanel />
        </ChatProvider>
      </AuthProvider>,
    );
    act(() => emitAuth({ uid: 'u1', displayName: 'Danny', email: 'd@example.com' }));

    fireEvent.click(screen.getByRole('button', { name: 'Concierge' }));
    const composer = screen.getByRole('textbox', { name: 'Ask about the data' });
    fireEvent.change(composer, { target: { value: 'Which 70s crime films rate above 9?' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
    });

    // The real round trip: fetch → express → authGate → firebase-admin
    // rejects → 401 JSON → ChatApiError kind 'auth' → DES-7 auth state.
    const alert = await screen.findByRole('alert', undefined, { timeout: 10_000 });
    expect(alert).toHaveTextContent(/your session expired\. sign in again to keep chatting\./i);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(composer).toBeDisabled();
  }, 15_000);
});

describe.runIf(!RUN)('integration guard', () => {
  it.skip('set CHAT_INTEGRATION=1 with the app/chat backend running to exercise the real 401 path', () => {});
});
