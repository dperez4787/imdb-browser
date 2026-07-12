/**
 * FilmographyGroup (IMDB-8, DES-5): one credit category from the data —
 * header is the category's own words (underscores → spaces via the shared
 * title formatter, uppercased by CSS, never a hard-coded list), rows are
 * FilmographyRows year-descending. Groups with no members never reach this
 * component (groupFilmography drops them). Long lists render fully — no
 * pagination (DES-5 Behavior).
 */
import { formatCategory } from '../title/format.js';
import FilmographyRow from './FilmographyRow.jsx';

export default function FilmographyGroup({ category, entries }) {
  if (!entries?.length) return null;
  return (
    <section className="filmography-group" data-category={category}>
      <h3 className="filmography-group__header">{formatCategory(category)}</h3>
      <ul className="filmography-group__list">
        {entries.map((entry) => (
          <FilmographyRow
            key={`${entry.title.tconst}-${entry.ordering ?? entry.title.tconst}`}
            entry={entry}
          />
        ))}
      </ul>
    </section>
  );
}
