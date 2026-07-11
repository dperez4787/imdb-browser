/**
 * IMDB-2: the signed-in identity + sign-out affordance (DES-1 UserMenu) —
 * avatar/monogram, menu contents, sign-out wiring, and the keyboard contract —
 * with ./auth.js faked at its module seam.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './AuthContext.jsx';
import UserMenu from './UserMenu.jsx';
import { signOutUser, subscribeToAuth } from './auth.js';
import { ingestResponse, resetGovernanceRoles } from './graphql/rolesStore.js';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

let authListener;

beforeEach(() => {
  vi.clearAllMocks();
  resetGovernanceRoles(); // every test starts at Unknown
  subscribeToAuth.mockImplementation((listener) => {
    authListener = listener;
    return () => {};
  });
  signOutUser.mockResolvedValue(undefined);
});

/** Feed the governance role signal exactly as client.js does off a response. */
function ingest(map) {
  act(() => ingestResponse(new Headers(map)));
}

const fullUser = {
  uid: 'u1',
  displayName: 'Danny Perez',
  email: 'danny@example.com',
  photoURL: 'https://example.com/avatar.jpg',
};

// In the real app UserMenu only ever mounts inside the AuthGate's signed-in
// branch; mirror that guarantee here.
function GatedMenu() {
  const { user } = useAuth();
  return user ? <UserMenu /> : null;
}

function renderMenu(user = fullUser) {
  const view = render(
    <AuthProvider>
      <GatedMenu />
    </AuthProvider>,
  );
  act(() => authListener(user));
  return view;
}

describe('UserMenu', () => {
  it('shows the Google avatar photo on the menu button', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    const img = button.querySelector('img');
    expect(img).toHaveAttribute('src', fullUser.photoURL);
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('falls back to a monogram when there is no photo URL', () => {
    renderMenu({ ...fullUser, photoURL: null });

    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('.monogram')).toHaveTextContent('DP');
  });

  it('swaps to the monogram when the avatar image fails to load', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    fireEvent.error(button.querySelector('img'));

    expect(button.querySelector('img')).toBeNull();
    expect(button.querySelector('.monogram')).toHaveTextContent('DP');
  });

  it('opens a menu showing display name, email, and Sign out; focus lands in the menu', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();
    expect(screen.getByText('Danny Perez')).toBeVisible();
    expect(screen.getByText('danny@example.com')).toBeVisible();

    const signOutItem = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(signOutItem).toHaveFocus();
  });

  it('signs out through the auth boundary and closes the menu on click', async () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    });

    expect(signOutUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and returns focus to the avatar button', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('traps Tab inside the open menu', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Tab' });

    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    expect(screen.getByRole('menu')).toBeVisible();
  });

  it('closes when clicking outside the menu', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

// IMDB-17 (DES-1 addendum): the governance role badge on the trigger and the
// "Data roles" menu section, driven by the same module store client.js feeds.
describe('UserMenu — governance role badge (IMDB-17)', () => {
  it('carries the RoleBadge inside the single trigger, left of the avatar (no new tab stop)', () => {
    renderMenu();
    // One button in the trigger — the badge adds no tab stop.
    const button = screen.getByRole('button', { name: 'Account: Danny Perez' });
    expect(button.querySelector('.role-badge')).toBeInTheDocument();

    ingest({ 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' });
    expect(button.querySelector('.role-badge')).toHaveAttribute('data-roles', 'analyst,public');
  });

  it('accessible name: unknown = just the name; then extends with the badge state, silently', () => {
    renderMenu();
    // Unknown (no response yet) — the name only, so the base IMDB-2 contract holds.
    expect(screen.getByRole('button', { name: 'Account: Danny Perez' })).toBeInTheDocument();

    ingest({ 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' });
    expect(
      screen.getByRole('button', { name: 'Account: Danny Perez — data roles: analyst, public' }),
    ).toBeInTheDocument();

    ingest({ 'X-Imdb-Policy-Revision': '13' }); // header absent → no roles
    expect(
      screen.getByRole('button', { name: 'Account: Danny Perez — no data role' }),
    ).toBeInTheDocument();
  });

  it('menu Data roles section: lists roles and the policy revision when present', () => {
    renderMenu();
    ingest({ 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' });

    fireEvent.click(screen.getByRole('button', { name: /Account: Danny Perez/ }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Data roles');
    expect(menu).toHaveTextContent('analyst, public');
    expect(menu).toHaveTextContent('policy rev 12');
    // Still exactly one action — the section is static text, not a menu item.
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('menu Data roles section: no-roles shows the exact copy and the redaction explanation', () => {
    renderMenu();
    ingest({ 'X-Imdb-Policy-Revision': '12' }); // header absent → no roles

    fireEvent.click(screen.getByRole('button', { name: /Account: Danny Perez/ }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('No data role');
    expect(menu).toHaveTextContent(/Governed fields are redacted for you/);
    expect(menu).toHaveTextContent('policy rev 12');
  });

  it('menu Data roles section: shows an em dash while Unknown (never reflows on first response)', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account: Danny Perez' }));
    const section = screen.getByRole('menu').querySelector('.user-menu__roles');
    expect(section).toHaveTextContent('—');
    expect(section).not.toHaveTextContent('policy rev');
  });
});
