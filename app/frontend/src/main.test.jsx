/**
 * The real entry module (`main.jsx`) must mount the app into `#root` — the same
 * path `npm run dev` serves — with no console errors. Since IMDB-2 the app
 * boots behind the AuthGate: with ./auth.js faked (never real Firebase) and
 * auth state unresolved, the entry must render exactly the AuthCurtain —
 * proving no flash of the sign-in screen or the shell on load. Gate-state
 * transitions are covered in App.test.jsx / AuthGate.test.jsx.
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth.js', () => ({
  subscribeToAuth: vi.fn(() => () => {}),
  signInWithGoogle: vi.fn(),
  signInAsGuest: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

describe('main.jsx entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts the auth curtain into #root while auth resolves, with no console errors', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main.jsx');

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });
    // Neither the sign-in screen nor the signed-in chrome may flash.
    expect(screen.queryByRole('button', { name: /sign in with google/i })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(document.getElementById('root')).not.toBeEmptyDOMElement();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
