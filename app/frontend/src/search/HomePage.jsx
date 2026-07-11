// Home route `/` (DES-2): the home route IS the search page — wordmark, hero
// omnibox (auto-focused), and one quiet link into the faceted view (DES-3 /
// IMDB-6; a placeholder route until that ticket lands). Nothing else: no data
// is fetched until the user types.
import { Link } from 'react-router';

import Wordmark from '../Wordmark.jsx';
import Omnibox from './Omnibox.jsx';

export default function HomePage() {
  return (
    <section className="home">
      <h1 className="home__wordmark">
        <Wordmark />
      </h1>
      <Omnibox variant="hero" autoFocus />
      <p className="home__browse">
        <Link to="/titles">Browse all titles →</Link>
      </p>
    </section>
  );
}
