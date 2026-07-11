import Wordmark from './Wordmark.jsx';

// The auth-resolving splash (DES-1: "the curtain"). Rendered by AuthGate while
// Firebase resolves persisted auth state on page load. It is neither the
// sign-in screen nor the app shell, so neither can flash. No spinner, no text
// beyond the wordmark — a gentle CSS pulse that goes unnoticed when auth
// resolves quickly.
export default function AuthCurtain() {
  return (
    <div className="auth-curtain" role="status" aria-label="Loading">
      <Wordmark />
    </div>
  );
}
