/**
 * IMDB-2: the AuthGate's three states (curtain / sign-in screen / children)
 * and the sign-in screen's behaviors, driven through the real AuthProvider
 * with ./auth.js faked at its module seam — no real Firebase anywhere.
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from './AuthContext.jsx';
import AuthGate from './AuthGate.jsx';
import { signInWithGoogle, subscribeToAuth } from './auth.js';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

let authListener;

beforeEach(() => {
  vi.clearAllMocks();
  authListener = undefined;
  subscribeToAuth.mockImplementation((listener) => {
    authListener = listener;
    return () => {};
  });
});

function renderGate() {
  return render(
    <AuthProvider>
      <AuthGate>
        <div data-testid="app-shell">the shell</div>
      </AuthGate>
    </AuthProvider>,
  );
}

const fakeUser = {
  uid: 'u1',
  displayName: 'Danny Perez',
  email: 'danny@example.com',
  photoURL: null,
};

describe('AuthGate states', () => {
  it('renders only the curtain while auth state resolves — no sign-in screen, no shell', () => {
    renderGate();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('renders only the sign-in screen once resolved signed-out', () => {
    renderGate();
    act(() => authListener(null));

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    expect(screen.getByText(/google sign-in only\. no account is created here\./i)).toBeVisible();
    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  it('renders children (and no sign-in screen) once resolved signed-in — reload stays signed in', () => {
    renderGate();
    act(() => authListener(fakeUser));

    expect(screen.getByTestId('app-shell')).toBeVisible();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
  });

  it('returns to the sign-in screen immediately when auth state becomes null (sign-out)', () => {
    renderGate();
    act(() => authListener(fakeUser));
    act(() => authListener(null));

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });
});

describe('sign-in screen', () => {
  it('gives the Google button initial focus and triggers the Google sign-in on click', async () => {
    renderGate();
    act(() => authListener(null));

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toHaveFocus();

    signInWithGoogle.mockResolvedValue({ user: fakeUser });
    await act(async () => button.click());
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows a spinner while sign-in is in flight', async () => {
    renderGate();
    act(() => authListener(null));

    let resolveSignIn;
    signInWithGoogle.mockImplementation(
      () => new Promise((resolve) => (resolveSignIn = resolve)),
    );

    const button = screen.getByRole('button', { name: /sign in with google/i });
    await act(async () => button.click());

    expect(button).toBeDisabled();
    expect(screen.getByRole('status', { name: /signing in/i })).toBeInTheDocument();

    await act(async () => resolveSignIn({ user: fakeUser }));
  });

  it('shows the designed inline error when the popup is closed, leaving the button enabled', async () => {
    renderGate();
    act(() => authListener(null));

    signInWithGoogle.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    const button = screen.getByRole('button', { name: /sign in with google/i });
    await act(async () => button.click());

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't sign in — the sign-in window was closed. Try again.",
    );
    expect(button).toBeEnabled();
  });

  it('shows a network-failure error and clears it on retry', async () => {
    renderGate();
    act(() => authListener(null));

    signInWithGoogle.mockRejectedValue({ code: 'auth/network-request-failed' });
    const button = screen.getByRole('button', { name: /sign in with google/i });
    await act(async () => button.click());
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't sign in — a network error interrupted it. Try again.",
    );

    signInWithGoogle.mockImplementation(() => new Promise(() => {}));
    await act(async () => button.click());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
