/**
 * SearchHitRow (IMDB-5, DES-2 row anatomy): one result row, variant
 * title | person, visually identical whether it came from the union or the
 * prefix fill.
 *
 *   - Title: 40×60 PosterImage (FallbackArt on missing/404), primary title,
 *     muted "year · type · ★ rating (votes)" — missing fields drop out of the
 *     line silently. The votes parenthetical is OPPORTUNISTIC: numVotes is a
 *     governed field (denied to everyone today), so it renders only when the
 *     response carries a value — never a placeholder, never DES-8 treatment.
 *   - Person: 40px Monogram disc (no people images exist), primary name,
 *     muted professions (max 3, fallback word "Person").
 */
import Monogram from '../Monogram.jsx';
import PosterImage from '../PosterImage.jsx';

const TITLE_TYPE_LABELS = {
  movie: 'Movie',
  tvSeries: 'Series',
  tvMiniSeries: 'Mini-series',
  tvMovie: 'TV Movie',
  tvEpisode: 'Episode',
  tvSpecial: 'TV Special',
  tvShort: 'TV Short',
  short: 'Short',
  video: 'Video',
  videoGame: 'Video Game',
};

/** "tvSeries" → "Series"; unknown enum values get a capitalized fallback. */
export function titleTypeLabel(titleType) {
  if (!titleType) return null;
  return TITLE_TYPE_LABELS[titleType] ?? titleType.charAt(0).toUpperCase() + titleType.slice(1);
}

/** 2145672 → "2.1M", 34120 → "34K" (DES-2's compact votes parenthetical). */
export function compactVotes(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(count);
}

/** ["actor","casting_director",…] → "Actor · Casting Director" (max 3). */
export function professionsLine(professions) {
  const labels = (professions ?? [])
    .slice(0, 3)
    .map((p) =>
      String(p)
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    );
  return labels.length > 0 ? labels.join(' · ') : 'Person';
}

/** The muted metadata line for a title row; null when nothing is known. */
export function titleMetaLine(entity) {
  const parts = [];
  if (entity.startYear != null) parts.push(String(entity.startYear));
  const type = titleTypeLabel(entity.titleType);
  if (type) parts.push(type);
  const avg = entity.rating?.averageRating;
  if (avg != null) {
    const votes = entity.rating?.numVotes;
    parts.push(`★ ${Number(avg).toFixed(1)}${votes != null ? ` (${compactVotes(votes)})` : ''}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function SearchHitRow({ row, optionId, selected, onSelect, onHover }) {
  const { kind, entity } = row;
  const primary = kind === 'title' ? entity.primaryTitle : entity.primaryName;
  const meta = kind === 'title' ? titleMetaLine(entity) : professionsLine(entity.primaryProfessions);

  return (
    <li
      id={optionId}
      role="option"
      aria-selected={selected}
      className={`search-hit search-hit--${kind}${selected ? ' search-hit--selected' : ''}`}
      onMouseEnter={onHover}
      // Mouse down would blur the input (closing the panel) before click
      // lands; keep focus where it is and let onClick navigate.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <span className="search-hit__thumb">
        {kind === 'title' ? (
          <PosterImage tconst={entity.tconst} title={primary} width={40} height={60} />
        ) : (
          <Monogram text={primary} seed={entity.nconst} size={40} />
        )}
      </span>
      <span className="search-hit__text">
        <span className="search-hit__primary">{primary}</span>
        {meta && <span className="search-hit__meta">{meta}</span>}
      </span>
    </li>
  );
}
