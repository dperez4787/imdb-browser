/**
 * IMDB-17 tester acceptance — the two UserMenu guarantees the developer's
 * tests assert only implicitly:
 *
 *   1. NO extra tab stop: the badge lives inside the single trigger button, so
 *      the focusable count is identical in every badge state (DES-1 tab order
 *      — wordmark, omnibox, chat toggle, avatar — gains nothing);
 *   2. sign-out resets the store to Unknown (DES-1 addendum "Sign-out: badge
 *      unmounts with the shell; a new sign-in starts at Unknown again") — the
 *      next user must not flash the prior user's roles.
 *
 * Same seams as the developer's UserMenu.test.jsx: auth.js mocked, the role
 * signal driven exactly as client.js drives it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './AuthContext.jsx';
import UserMenu from './UserMenu.jsx';
import { signOutUser, subscribeToAuth } from './auth.js';
import {
  getGovernanceRoles,
  ingestResponse,
  resetGovernanceRoles,
} from './graphql/rolesStore.js';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

let authListener;

beforeEach(() => {
  vi.clearAllMocks();
  resetGovernanceRoles();
  subscribeToAuth.mockImplementation((listener) => {
    authListener = listener;
    return () => {};
  });
  // Real sign-out flow: auth resolves, then the auth listener reports null and
  // the gate unmounts the menu — mirrored here so unmount-time behavior runs.
  signOutUser.mockImplementation(async () => act(() => authListener(null)));
});

function ingest(map) {
  act(() => ingestResponse(new Headers(map)));
}

const user = { uid: 'u1', displayName: 'Danny Perez', email: 'danny@example.com', photoURL: null };

function GatedMenu() {
  const { user: current } = useAuth();
  return current ? <UserMenu /> : null;
}

function renderMenu() {
  const view = render(
    <AuthProvider>
      <GatedMenu />
    </AuthProvider>,
  );
  act(() => authListener(user));
  return view;
}

describe('IMDB-17: no extra tab stop', () => {
  it('exactly ONE focusable trigger in every badge state — the badge adds no button', () => {
    renderMenu();

    // Unknown.
    expect(screen.getAllByRole('button')).toHaveLength(1);

    // Roles present.
    ingest({ 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' });
    expect(screen.getAllByRole('button')).toHaveLength(1);

    // No roles.
    ingest({ 'X-Imdb-Policy-Revision': '13' });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    // The pill itself is presentation only: aria-hidden, no tabindex, and it
    // lives INSIDE that one trigger.
    const badge = buttons[0].querySelector('.role-badge');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge.querySelector('[tabindex]')).toBeNull();
    expect(badge.querySelector('button')).toBeNull();
  });

  it('the open menu has exactly two menuitems; the Data roles section itself stays non-focusable', () => {
    // Was one (Sign out only); the governance-console link is the second
    // (user-directed, 2026-07-12). The invariant this test protects is
    // unchanged: the Data roles TEXT section contributes no focusable —
    // the badge/roles copy never becomes a click target.
    renderMenu();
    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' });

    fireEvent.click(screen.getByRole('button', { name: /Account: Danny Perez/ }));

    expect(screen.getAllByRole('menuitem')).toHaveLength(2); // admin link + Sign out
    const section = screen.getByRole('menu').querySelector('.user-menu__roles');
    expect(section.querySelector('button, a, [tabindex]')).toBeNull();
  });
});

describe('IMDB-17: sign-out returns the signal to Unknown', () => {
  it('signing out unmounts the menu and resets the store — no stale roles for the next sign-in', async () => {
    renderMenu();
    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' });
    expect(getGovernanceRoles()).toEqual({ roles: ['analyst'], revision: 12 });

    fireEvent.click(screen.getByRole('button', { name: /Account: Danny Perez/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    });

    expect(signOutUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).toBeNull(); // shell gone
    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null }); // Unknown again
  });

  it('plain unmount (gate teardown) also resets to Unknown', () => {
    const view = renderMenu();
    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' });

    view.unmount();

    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null });
  });
});
