/**
 * IMDB-11 AC: "Signed-out users never see the chat UI" and "From any
 * signed-in view, the designed chat affordance is visible" — proven through
 * the REAL App composition root (AuthProvider → AuthGate → AppShell), with
 * auth.js faked at its module seam.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App.jsx';
import { subscribeToAuth } from '../auth.js';
import { createQueryClient } from '../graphql/queryClient.js';

vi.mock('../auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

// Since IMDB-5, App owns the route table and its views use TanStack Query,
// so mounting it needs the same providers main.jsx supplies in production
// (QueryClient + a router). Mechanical wrapper only — zero assertion changes.
const renderApp = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

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
    renderApp();
    act(() => emitAuth(null));

    expect(screen.queryByRole('button', { name: /concierge/i })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Concierge' })).toBeNull();
    expect(document.querySelector('.chat-toggle, .chat-panel, .chat-dock')).toBeNull();
  });

  it('shows the TopBar toggle on the signed-in view, and sign-out removes chat UI (and its session) entirely', () => {
    renderApp();
    act(() => emitAuth({ uid: 'u1', displayName: 'Danny Perez', email: 'd@example.com' }));

    expect(screen.getByRole('button', { name: 'Concierge' })).toBeVisible();

    act(() => emitAuth(null));
    expect(screen.queryByRole('button', { name: /concierge/i })).toBeNull();
    expect(document.querySelector('.chat-dock')).toBeNull();
  });
});
