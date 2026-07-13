/**
 * Guest entry on the sign-in card (user-directed, 2026-07-12): the quiet
 * second door. Anonymous Firebase sign-in via the auth.js boundary — no popup,
 * no account — with the same inline error treatment and a shared in-flight
 * lock so the two buttons can't race.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from './AuthContext.jsx';
import SignInScreen from './SignInScreen.jsx';
import { signInAsGuest, signInWithGoogle, subscribeToAuth } from './auth.js';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInAsGuest: vi.fn(),
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

function renderScreen() {
  const view = render(
    <AuthProvider>
      <SignInScreen />
    </AuthProvider>,
  );
  act(() => emitAuth(null));
  return view;
}

const guestButton = () =>
  screen.getByRole('button', { name: /continue as guest — no account needed/i });

describe('SignInScreen — guest entry', () => {
  it('renders the guest button as a secondary action alongside Google', () => {
    renderScreen();
    expect(guestButton()).toBeVisible();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    // Initial focus stays on the primary (Google) action — DES-1 unchanged.
    expect(screen.getByRole('button', { name: /sign in with google/i })).toHaveFocus();
  });

  it('signs in anonymously through the auth boundary', async () => {
    signInAsGuest.mockResolvedValue({ user: { uid: 'anon-1', isAnonymous: true } });
    renderScreen();

    await act(async () => {
      fireEvent.click(guestButton());
    });

    expect(signInAsGuest).toHaveBeenCalledTimes(1);
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it('disables BOTH buttons while either sign-in is in flight (no racing)', async () => {
    let resolveGuest;
    signInAsGuest.mockImplementation(() => new Promise((resolve) => { resolveGuest = resolve; }));
    renderScreen();

    fireEvent.click(guestButton());
    expect(guestButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();

    await act(async () => resolveGuest({}));
  });

  it('surfaces a guest sign-in failure with the designed inline error', async () => {
    signInAsGuest.mockRejectedValue(
      Object.assign(new Error('admin-restricted'), { code: 'auth/admin-restricted-operation' }),
    );
    renderScreen();

    await act(async () => {
      fireEvent.click(guestButton());
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't sign in —/i);
    expect(guestButton()).toBeEnabled(); // recoverable — try again
  });
});
