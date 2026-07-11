/**
 * App composition root (IMDB-2): everything user-visible lives inside the
 * AuthGate, so signed-out users see exactly one thing — the sign-in screen.
 *
 * Still deliberately feature-empty behind the gate: routing arrives with the
 * first routed view (docs/architecture.md, "Frontend routing & URL scheme"),
 * data fetching with IMDB-4's GraphQL client. The placeholder below makes zero
 * network requests.
 */
import AppShell from './AppShell.jsx';
import { AuthProvider } from './AuthContext.jsx';
import AuthGate from './AuthGate.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell>
          <section className="home-placeholder">
            <h1>Now showing: nothing yet</h1>
            <p>
              Browsing over the federated IMDb graph arrives with the next
              tickets. You are signed in, and the marquee is lit.
            </p>
          </section>
        </AppShell>
      </AuthGate>
    </AuthProvider>
  );
}
