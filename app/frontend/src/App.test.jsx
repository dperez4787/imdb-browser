/**
 * IMDB-2/IMDB-5: the full composition — App wires AuthProvider → AuthGate →
 * AppShell → route table — exercised end-to-end (curtain → sign-in → shell →
 * sign-out) with ./auth.js faked at its module seam. No real Firebase and no
 * network in any test: the omnibox only fetches once the user types >= 2
 * characters, which these tests never do. BrowserRouter lives in main.jsx, so
 * App mounts here inside a MemoryRouter.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { signInWithGoogle, signOutUser, subscribeToAuth } from './auth.js';
import { createQueryClient } from './graphql/queryClient.js';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

let authListener;

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToAuth.mockImplementation((listener) => {
    authListener = listener;
    return () => {};
  });
});

const fakeUser = {
  uid: 'u1',
  displayName: 'Danny Perez',
  email: 'danny@example.com',
  photoURL: null,
};

function renderApp(initialEntries = ['/']) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App (composition root)', () => {
  it('walks the whole gate: curtain → sign-in screen → shell → sign out → sign-in screen', async () => {
    renderApp();

    // Resolving: only the curtain — never a flash of either real screen.
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();

    // Resolved signed-out: only the sign-in screen; no chrome, no search UI.
    act(() => authListener(null));
    const signInButton = screen.getByRole('button', { name: /sign in with google/i });
    expect(signInButton).toBeVisible();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();

    // Sign in: the shell appears — identity in the TopBar, hero omnibox on /.
    signInWithGoogle.mockResolvedValue({ user: fakeUser });
    await act(async () => signInButton.click());
    act(() => authListener(fakeUser));

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Account: Danny Perez' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Search titles & people' })).toBeVisible();

    // Sign out from the UserMenu: back to the sign-in screen immediately.
    signOutUser.mockImplementation(async () => act(() => authListener(null)));
    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    });

    expect(signOutUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('a reload while signed in resolves straight from curtain to shell — no sign-in flash', () => {
    renderApp();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    act(() => authListener(fakeUser));

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
  });
});

describe('route table (docs/architecture.md — Frontend routing & URL scheme)', () => {
  const signIn = () => act(() => authListener(fakeUser));

  it('/ is the search home: hero omnibox, no compact TopBar omnibox beside it', () => {
    renderApp(['/']);
    signIn();
    // Exactly one omnibox on the home route (the hero variant).
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByText('Browse all titles →')).toBeVisible();
  });

  it('/title/:tconst renders the placeholder detail route (until IMDB-7)', () => {
    renderApp(['/title/tt0068646']);
    signIn();
    expect(screen.getByRole('heading', { name: 'Title tt0068646' })).toBeVisible();
    // Off-home, the compact omnibox lives in the TopBar.
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('combobox'));
  });

  it('/person/:nconst renders the placeholder detail route (until IMDB-8)', () => {
    renderApp(['/person/nm0000338']);
    signIn();
    expect(screen.getByRole('heading', { name: 'Person nm0000338' })).toBeVisible();
  });

  it('/search?q=… renders the reserved results placeholder with the query', () => {
    renderApp(['/search?q=godfather']);
    signIn();
    expect(screen.getByRole('heading', { name: 'Search — “godfather”' })).toBeVisible();
  });

  it('unknown paths render the quiet not-found screen', () => {
    // `/titles` is now the faceted title search (IMDB-6); use a genuinely
    // unrouted path to exercise the not-found fallback.
    renderApp(['/no-such-route']);
    signIn();
    expect(screen.getByRole('heading', { name: 'Nothing showing here' })).toBeVisible();
  });
});
