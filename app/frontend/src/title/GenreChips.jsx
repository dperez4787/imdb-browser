/**
 * GenreChips (IMDB-7, DES-4): one chip per genre, each a real link into the
 * faceted view pre-filtered to that genre — even metadata is a door.
 *
 * Chips render as links from day one (per the IMDB-6/IMDB-7 coordination
 * directive): the /titles route and its `genres` query param are settled in
 * docs/architecture.md ("Frontend routing & URL scheme"), so the hrefs are
 * stable regardless of IMDB-6's merge state. Until IMDB-6 lands, the target
 * is the app's not-found route — a navigable page, never a 404.
 */
import { Link } from 'react-router';

/** /titles pre-filtered to one genre, per the architecture's URL scheme. */
export function genreHref(genre) {
  return `/titles?genres=${encodeURIComponent(genre)}`;
}

export default function GenreChips({ genres }) {
  if (!Array.isArray(genres) || genres.length === 0) return null;
  return (
    <ul className="genre-chips" aria-label="Genres">
      {genres.map((genre) => (
        <li key={genre}>
          <Link className="genre-chip" to={genreHref(genre)}>
            {genre}
          </Link>
        </li>
      ))}
    </ul>
  );
}
