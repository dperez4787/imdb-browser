/**
 * Placeholder shell for the imdb-browser SPA (IMDB-1).
 *
 * Deliberately empty of features: no routing (OPEN in docs/architecture.md),
 * no data fetching (GraphQL client lands with IMDB-4), no auth (IMDB-2).
 */
export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 2rem', textAlign: 'center' }}>
      <h1>imdb-browser</h1>
      <p>Rich browsing over the federated IMDb graph — coming soon.</p>
    </main>
  );
}
