/**
 * IMDB-2 acceptance tests — written by the tester, independently of the
 * developer's colocated tests. These render the REAL <App /> composition root
 * (AuthProvider → AuthGate → AppShell/TopBar/UserMenu), with `./auth.js` faked
 * at its module seam so no test ever touches real Firebase.
 *
 * The fake behaves like the real boundary: sign-in/sign-out resolve and then
 * fire the auth subscription (as onAuthStateChanged would), so the flows here
 * are the user-visible flows, not unit shortcuts.
 *
 * Criteria covered (ticket IMDB-2 + DES-1 states):
 *   AC1 — signed out, only the sign-in screen; no other view/nav/data.
 *   AC2 — completing sign-in lands in the shell with identity + sign-out.
 *   AC3 — curtain while resolving; signed-in resolution never flashes sign-in.
 *   AC4 — sign out returns immediately to the sign-in screen.
 *   DES-1 — inline sign-in error (popup closed / network), in-flight state,
 *            initial focus, UserMenu keyboard contract (Esc + focus return).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import {
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
} from './auth.js';
import { createQueryClient } from './graphql/queryClient.js';

// Since IMDB-5, App mounts a route table and the omnibox's query hook, so the
// composition needs the same providers main.jsx supplies in production
// (QueryClient + a router). Mechanical wrapper only — every assertion below
// is unchanged, and no test types into the omnibox, so still zero network.
const renderApp = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInAsGuest: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

const googleUser = {
  uid: 'google-uid-1',
  displayName: 'Danny Perez',
  email: 'perez.f.danny@gmail.com',
  photoURL: null, // exercise the Monogram identity path by default
};

let emitAuth; // fires the subscribed listener, as Firebase would
let fetchSpy;

beforeEach(() => {
  vi.clearAllMocks();
  emitAuth = undefined;
  subscribeToAuth.mockImplementation((listener) => {
    emitAuth = listener;
    return () => {};
  });
  // Realistic seam behavior: success flows back through the subscription.
  signInWithGoogle.mockImplementation(async () => {
    emitAuth?.(googleUser);
    return { user: googleUser };
  });
  signOutUser.mockImplementation(async () => {
    emitAuth?.(null);
  });
  // AC1 / DES-1: zero network traffic signed-out must be observable.
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const signInButton = () =>
  screen.getByRole('button', { name: /sign in with google/i });

describe('AC3 / DES-1 — the curtain (auth resolving, no flash of either screen)', () => {
  it('renders only the curtain until the auth subscription first fires', () => {
    renderApp();

    // Neither the sign-in screen nor any shell chrome exists yet.
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull(); // TopBar <header>
    expect(screen.queryByText(/now showing/i)).toBeNull();
  });

  it('resolving signed-in goes curtain → shell with the sign-in screen never mounting', () => {
    renderApp();
    act(() => emitAuth(googleUser));

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByRole('status', { name: /loading/i })).toBeNull();
  });

  it('resolving signed-out goes curtain → sign-in with the shell never mounting', () => {
    renderApp();
    act(() => emitAuth(null));

    expect(signInButton()).toBeVisible();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('status', { name: /loading/i })).toBeNull();
  });
});

describe('AC1 — signed out, the sign-in screen is the only reachable surface', () => {
  it('shows the designed sign-in card and nothing else from the app', () => {
    renderApp();
    act(() => emitAuth(null));

    expect(signInButton()).toBeVisible();
    expect(
      screen.getByText(/google sign-in or one-click guest access\. no account is created here\./i),
    ).toBeVisible();

    // No shell chrome, no routed view, no APP navigation of any kind. The one
    // sanctioned anchor is the external making-of story link (user-directed,
    // 2026-07-12): it must be the ONLY link, external, and open in a new tab —
    // in-app hrefs (starting with "/") remain forbidden signed-out.
    expect(screen.queryByRole('banner')).toBeNull();
    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://project-d60a83c1-2c60-4d51-ad0.web.app/blog/imdb-federation/',
    );
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/now showing/i)).toBeNull();
    expect(document.querySelector('.app-shell')).toBeNull();
  });

  it('makes zero data or image requests signed-out (DES-1: pure-CSS ornament)', () => {
    renderApp();
    act(() => emitAuth(null));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('img').length).toBe(0);
  });

  it('puts initial focus on the Google button (DES-1 keyboard/focus)', () => {
    renderApp();
    act(() => emitAuth(null));

    expect(signInButton()).toHaveFocus();
  });
});

describe('AC2 — completing Google sign-in lands in the shell with identity + sign-out', () => {
  it('click → popup resolves → shell renders with the user identity visible', async () => {
    renderApp();
    act(() => emitAuth(null));

    await act(async () => {
      fireEvent.click(signInButton());
    });

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('banner')).toBeVisible();
    // Identity per the design: avatar button labeled with the display name;
    // no photoURL here, so the Monogram initials disc renders.
    const avatar = screen.getByRole('button', { name: 'Account: Danny Perez' });
    expect(avatar).toBeVisible();
    expect(avatar.textContent).toContain('DP');

    // The sign-out affordance is reachable and works end to end.
    fireEvent.click(avatar);
    const signOutItem = screen.getByRole('menuitem', { name: /sign out/i });
    expect(screen.getByText('Danny Perez')).toBeVisible();
    expect(screen.getByText('perez.f.danny@gmail.com')).toBeVisible();
    await act(async () => {
      fireEvent.click(signOutItem);
    });
    expect(signOutUser).toHaveBeenCalledTimes(1);
  });

  it('shows the Google photo avatar when photoURL is present', () => {
    renderApp();
    act(() =>
      emitAuth({ ...googleUser, photoURL: 'https://example.com/me.jpg' }),
    );

    const avatar = screen.getByRole('button', { name: 'Account: Danny Perez' });
    expect(avatar.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/me.jpg',
    );
  });
});

describe('AC4 — signing out returns immediately to the sign-in screen', () => {
  it('UserMenu → Sign out → sign-in screen, shell gone, menus discarded', async () => {
    renderApp();
    act(() => emitAuth(googleUser));

    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    });

    expect(signInButton()).toBeVisible();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText(/now showing/i)).toBeNull();
  });
});

describe('DES-1 — sign-in error and in-flight states', () => {
  it.each([
    ['auth/popup-closed-by-user', /the sign-in window was closed/i],
    ['auth/network-request-failed', /a network error interrupted it/i],
    ['auth/popup-blocked', /blocked the sign-in window/i],
  ])(
    'renders the inline "Couldn\'t sign in — … Try again." message for %s, button re-enabled',
    async (code, reason) => {
      renderApp();
      act(() => emitAuth(null));

      signInWithGoogle.mockRejectedValueOnce({ code });
      await act(async () => {
        fireEvent.click(signInButton());
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/couldn't sign in — /i);
      expect(alert).toHaveTextContent(reason);
      expect(alert).toHaveTextContent(/try again\./i);
      expect(signInButton()).toBeEnabled();
      // Still on the sign-in screen — an error never reveals the shell.
      expect(screen.queryByRole('banner')).toBeNull();
    },
  );

  it('disables the button with an inline spinner while the popup is in flight', async () => {
    renderApp();
    act(() => emitAuth(null));

    let finish;
    signInWithGoogle.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const button = signInButton();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(button).toBeDisabled();
    expect(screen.getByRole('status', { name: /signing in/i })).toBeInTheDocument();

    await act(async () => {
      emitAuth(googleUser);
      finish({ user: googleUser });
    });
    expect(screen.getByRole('banner')).toBeVisible();
  });

  it('a failed attempt is retryable and the retry can succeed', async () => {
    renderApp();
    act(() => emitAuth(null));

    signInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    await act(async () => {
      fireEvent.click(signInButton());
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(signInButton()); // default mock: succeeds via subscription
    });
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DES-1 — UserMenu keyboard contract', () => {
  it('opens with focus on Sign out, closes on Esc with focus returned to the avatar', () => {
    renderApp();
    act(() => emitAuth(googleUser));

    const avatar = screen.getByRole('button', { name: 'Account: Danny Perez' });
    fireEvent.click(avatar);

    const menu = screen.getByRole('menu', { name: /account/i });
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(avatar).toHaveFocus();
  });

  it('traps Tab while the menu is open (two-item cycle since the governance link)', () => {
    renderApp();
    act(() => emitAuth(googleUser));

    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    const menu = screen.getByRole('menu');
    // Tab cycles admin link <-> Sign out; two Tabs return to Sign out. Focus
    // never leaves the menu (the trap this AC pins), menu stays open.
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(
      screen.getByRole('menuitem', { name: /manage personas & field access/i }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toHaveFocus();
    expect(screen.getByRole('menu')).toBeVisible();
  });
});
