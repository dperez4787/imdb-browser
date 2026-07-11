/**
 * IMDB-11 AC: "Signed-out users never see the chat UI" and "From any
 * signed-in view, the designed chat affordance is visible" — proven through
 * the REAL App composition root (AuthProvider → AuthGate → AppShell), with
 * auth.js faked at its module seam.
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App.jsx';
import { subscribeToAuth } from '../auth.js';

vi.mock('../auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

let emitAuth;

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToAuth.mockImplementation((listener) => {
    emitAuth = listener;
    return () => {};
  });
});

describe('the concierge lives inside the AuthGate', () => {
  it('renders nothing chat-related signed out — no toggle, no panel', () => {
    render(<App />);
    act(() => emitAuth(null));

    expect(screen.queryByRole('button', { name: /concierge/i })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Concierge' })).toBeNull();
    expect(document.querySelector('.chat-toggle, .chat-panel, .chat-dock')).toBeNull();
  });

  it('shows the TopBar toggle on the signed-in view, and sign-out removes chat UI (and its session) entirely', () => {
    render(<App />);
    act(() => emitAuth({ uid: 'u1', displayName: 'Danny Perez', email: 'd@example.com' }));

    expect(screen.getByRole('button', { name: 'Concierge' })).toBeVisible();

    act(() => emitAuth(null));
    expect(screen.queryByRole('button', { name: /concierge/i })).toBeNull();
    expect(document.querySelector('.chat-dock')).toBeNull();
  });
});
