// /title/:tconst — minimal placeholder so search-result navigation works
// today; the real title detail page is IMDB-7 (DES-4).
import { useParams } from 'react-router';

export default function TitlePage() {
  const { tconst } = useParams();

  return (
    <section className="route-placeholder">
      <h1>Title {tconst}</h1>
      <p>The title detail page arrives with IMDB-7. The route — and how you got here — works.</p>
    </section>
  );
}
