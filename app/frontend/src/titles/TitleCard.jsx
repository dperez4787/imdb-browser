/**
 * TitleCard (IMDB-6, DES-3 ResultsGrid anatomy): one result card — a 2:3
 * poster (PosterImage → FallbackArt on missing/404, lazy-loaded), the title,
 * a muted `year · ★rating` line, and up to three genre names. The whole card
 * is ONE link to the title detail route (`Tab` walks cards, `Enter` opens).
 * Series-like cards additionally wear IMDB-20's "…" episodes affordance
 * (EpisodesPopover) as a SIBLING of that link, so the main click-through
 * stays whole.
 *
 * No vote count: DES-3's card shows the star rating only (`averageRating`,
 * ungoverned). `numVotes` is governed/denied and never rendered here, so this
 * card never shows the restricted treatment — the query carries numVotes only
 * to keep the plumbing ready for a grant (see titleSearchQueries.js).
 */
import { Link } from 'react-router';

import PosterImage from '../PosterImage.jsx';
import EpisodesPopover from './EpisodesPopover.jsx';

/**
 * IMDB-20: which cards wear the episodes "…" affordance. This is a UI
 * HEURISTIC over two well-known IMDb type values, not a data vocabulary —
 * the repo's no-hard-coding rule guards facet vocabularies (genres, title
 * types as filter options come from `facets`), whereas this merely decides
 * where a peek affordance is worth the pixels. A type outside the pair
 * (e.g. tvEpisode, movie) simply gets no "…"; its detail page still shows
 * children if the data has them, so the heuristic can never hide data.
 */
export function isSeriesLike(titleType) {
  return titleType === 'tvSeries' || titleType === 'tvMiniSeries';
}

/** "1972 · ★ 9.2" — parts drop out silently when unknown. */
export function titleCardMeta(item) {
  const parts = [];
  if (item.startYear != null) parts.push(String(item.startYear));
  const avg = item.rating?.averageRating;
  if (avg != null) parts.push(`★ ${Number(avg).toFixed(1)}`);
  return parts.join(' · ');
}

export default function TitleCard({ item }) {
  const genres = (item.genres ?? []).slice(0, 3);
  const meta = titleCardMeta(item);
  return (
    <li className="title-card">
      <Link className="title-card__link" to={`/title/${item.tconst}`}>
        <span className="title-card__poster">
          <PosterImage tconst={item.tconst} title={item.primaryTitle} width={180} height={270} />
        </span>
        <span className="title-card__body">
          <span className="title-card__title" title={item.primaryTitle}>
            {item.primaryTitle}
          </span>
          {meta && <span className="title-card__meta">{meta}</span>}
          {genres.length > 0 && <span className="title-card__genres">{genres.join(' · ')}</span>}
        </span>
      </Link>
      {/* IMDB-20: series-like cards peek at their episodes without leaving
          the grid. Sibling of the Link, so the card's main click-through is
          untouched. */}
      {isSeriesLike(item.titleType) && (
        <EpisodesPopover tconst={item.tconst} titleName={item.primaryTitle} />
      )}
    </li>
  );
}
