// Error / auth-rejection rendering (DES-7).
//
// - Auth rejection (401/expired token): "sign in again" message, NO retry
//   button — resolving auth is the fix (AuthGate owns re-sign-in; the composer
//   stays disabled until a send succeeds after re-auth).
// - Everything else (backend 5xx, network, interrupted stream, rate limit):
//   the designed error state with Retry. Retry re-sends the same message; the
//   failed exchange is replaced, never duplicated.
export default function ChatErrorNotice({ error, onRetry }) {
  if (error.kind === 'auth') {
    return (
      <div className="chat-error" role="alert">
        <p className="chat-error__headline">
          <span aria-hidden="true">⚠</span> Your session expired. Sign in again to keep chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="chat-error" role="alert">
      <p className="chat-error__headline">
        <span aria-hidden="true">⚠</span> The concierge couldn’t answer.
      </p>
      {error.kind === 'rate-limited' && <p className="chat-error__detail">{error.message}</p>}
      <button type="button" className="chat-error__retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
