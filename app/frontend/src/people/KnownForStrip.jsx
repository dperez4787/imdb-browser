/**
 * KnownForStrip (IMDB-8, DES-5): up to 4 TitleCards (the DES-3 card, shared
 * component) in a horizontal strip, sourced from `Name.knownForTitles` in
 * DATASET ORDER — the strip never reads `numVotes` (governed; the old
 * top-4-by-numVotes fallback is retired per the revised DES-5), so it
 * renders identically whether or not that coordinate is denied. Every card
 * links to /title/:tconst; posters fall back to FallbackArt via PosterImage.
 * Fewer than 2 known-for titles → the section doesn't render (a one-poster
 * "strip" looks broken — DES-5).
 */
import TitleCard from '../titles/TitleCard.jsx';

export default function KnownForStrip({ titles }) {
  const items = (titles ?? []).filter((title) => title?.tconst).slice(0, 4);
  if (items.length < 2) return null;
  return (
    <section className="known-for" aria-labelledby="known-for-header">
      <h2 className="known-for__header" id="known-for-header">
        Known for
      </h2>
      <ul className="known-for__strip">
        {items.map((title) => (
          <TitleCard key={title.tconst} item={title} />
        ))}
      </ul>
    </section>
  );
}
