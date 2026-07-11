/**
 * ResultsGrid (IMDB-6, DES-3): the 24-per-page card grid (6 cols ≥1200px,
 * 4 ≥960, 3 ≥720, 2 below — all in styles.css). During a filter/page change
 * the previous cards stay on screen dimmed (`dimmed`) while fresh data lands;
 * on first load the grid shows shimmer skeletons instead.
 */
import TitleCard from './TitleCard.jsx';

/** DES-3 first-load state: 12 shimmer poster cards. */
export function SkeletonGrid({ count = 12 }) {
  return (
    <ul className="results-grid results-grid--skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="title-card title-card--skeleton">
          <span className="title-card__poster skeleton-block" />
          <span className="title-card__body">
            <span className="skeleton-line skeleton-line--title" />
            <span className="skeleton-line skeleton-line--meta" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ResultsGrid({ items, dimmed = false }) {
  return (
    <ul className={`results-grid${dimmed ? ' results-grid--dimmed' : ''}`}>
      {items.map((item) => (
        <TitleCard key={item.tconst} item={item} />
      ))}
    </ul>
  );
}
