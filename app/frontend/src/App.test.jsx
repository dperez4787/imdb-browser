/**
 * IMDB-2: the full composition — App wires AuthProvider → AuthGate → AppShell —
 * exercised end-to-end (curtain → sign-in → shell → sign-out) with ./auth.js
 * faked at its module seam. No real Firebase in any test.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { signInWithGoogle, signOutUser, subscribeToAuth } from './auth.js';

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

describe('App (composition root)', () => {
  it('walks the whole gate: curtain → sign-in screen → shell → sign out → sign-in screen', async () => {
    render(<App />);

    // Resolving: only the curtain — never a flash of either real screen.
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();

    // Resolved signed-out: only the sign-in screen; no chrome, no content.
    act(() => authListener(null));
    const signInButton = screen.getByRole('button', { name: /sign in with google/i });
    expect(signInButton).toBeVisible();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('heading', { name: /now showing/i })).toBeNull();

    // Sign in: the shell appears with the user's identity in the TopBar.
    signInWithGoogle.mockResolvedValue({ user: fakeUser });
    await act(async () => signInButton.click());
    act(() => authListener(fakeUser));

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Account: Danny Perez' })).toBeVisible();
    expect(screen.getByRole('heading', { name: /now showing/i })).toBeVisible();

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
    render(<App />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    act(() => authListener(fakeUser));

    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
  });
});
