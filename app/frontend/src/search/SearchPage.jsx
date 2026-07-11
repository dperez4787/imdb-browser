// /search?q=… — reserved by the route table (docs/architecture.md, "Frontend
// routing & URL scheme") for a full mixed-results page. DES-2 deliberately
// does not design that surface, so this stays a minimal placeholder; the
// union field (limit up to 50) is its ready-made data path when a follow-up
// spec picks it up.
import { useSearchParams } from 'react-router';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';

  return (
    <section className="route-placeholder">
      <h1>Search{q ? ` — “${q}”` : ''}</h1>
      <p>
        The full results page isn’t designed yet — the omnibox autocomplete above is the way to
        search for now.
      </p>
    </section>
  );
}
