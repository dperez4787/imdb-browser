import { useEffect, useRef, useState } from 'react';

import { useAuth } from './AuthContext.jsx';
import Wordmark from './Wordmark.jsx';

// DES-1: "Couldn't sign in — <short reason>. Try again." — short reasons for
// the failure modes the design calls out (popup closed, network failure), with
// an honest generic fallback so a real misconfiguration is never silent.
function shortReason(err) {
  switch (err?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'the sign-in window was closed';
    case 'auth/popup-blocked':
      return 'your browser blocked the sign-in window';
    case 'auth/network-request-failed':
      return 'a network error interrupted it';
    default:
      return err?.message ?? 'something went wrong';
  }
}

// Standard Google "G" mark (Google sign-in branding guidelines).
function GoogleGMark() {
  return (
    <svg className="google-btn__mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

// The only signed-out view (DES-1). Centered card on the dark surface with the
// marquee-dot ornament (pure CSS — zero data or image requests signed-out),
// exactly one action (Google sign-in), an inline in-flight state (spinner
// replaces the G mark, button disabled), and an inline error under the button.
export default function SignInScreen() {
  const { signIn, signInGuest } = useAuth();
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState(null);
  const buttonRef = useRef(null);

  // DES-1 keyboard/focus: initial focus lands on the Google button.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  async function handleSignIn() {
    setError(null);
    setInFlight(true);
    try {
      await signIn();
      // Success unmounts this screen via the auth subscription; no local
      // state change is needed (and by then this component may be gone).
    } catch (err) {
      setError(`Couldn't sign in — ${shortReason(err)}. Try again.`);
      setInFlight(false);
    }
  }

  // Guest entry (user-directed, 2026-07-12): anonymous Firebase sign-in — no
  // popup, no account. Shares the in-flight lock with the Google path so the
  // two buttons can't race.
  async function handleGuest() {
    setError(null);
    setInFlight(true);
    try {
      await signInGuest();
    } catch (err) {
      setError(`Couldn't sign in — ${shortReason(err)}. Try again.`);
      setInFlight(false);
    }
  }

  return (
    <main className="signin">
      <div className="signin__dots" aria-hidden="true" />
      <section className="signin__card" aria-labelledby="signin-title">
        <h1 id="signin-title" className="signin__wordmark">
          <Wordmark />
        </h1>
        <p className="signin__tagline">
          Browse IMDb like a lobby, not a spreadsheet
        </p>
        <button
          ref={buttonRef}
          className="google-btn"
          type="button"
          onClick={handleSignIn}
          disabled={inFlight}
        >
          {inFlight ? (
            <span className="google-btn__spinner" role="status" aria-label="Signing in" />
          ) : (
            <GoogleGMark />
          )}
          Sign in with Google
        </button>
        <button
          className="guest-btn"
          type="button"
          onClick={handleGuest}
          disabled={inFlight}
        >
          Continue as guest — no account needed
        </button>
        {error && (
          <p className="signin__error" role="alert">
            {error}
          </p>
        )}
        <p className="signin__caption">
          Google sign-in or one-click guest access. No account is created here.
        </p>
        <a
          className="signin__story"
          href="https://project-d60a83c1-2c60-4d51-ad0.web.app/blog/imdb-federation/"
          target="_blank"
          rel="noreferrer"
        >
          Built end-to-end by an agent team — read the making-of&nbsp;↗
        </a>
      </section>
      <div className="signin__dots" aria-hidden="true" />
    </main>
  );
}
