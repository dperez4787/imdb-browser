// /person/:nconst — minimal placeholder so search-result navigation works
// today; the real person detail page is IMDB-8 (DES-5/DES-6).
import { useParams } from 'react-router';

export default function PersonPage() {
  const { nconst } = useParams();

  return (
    <section className="route-placeholder">
      <h1>Person {nconst}</h1>
      <p>The person detail page arrives with IMDB-8. The route — and how you got here — works.</p>
    </section>
  );
}
