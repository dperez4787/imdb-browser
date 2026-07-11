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
  signOutUser.mockResolvedValue(undefined);
});

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
