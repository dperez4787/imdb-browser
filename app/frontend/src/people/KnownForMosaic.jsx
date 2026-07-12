/**
 * KnownForMosaic (IMDB-9, DES-6): the person-page identity visual — "a person
 * is shown as their work". A 2×2 mosaic of the person's known-for title
 * posters filling the same fixed square DES-5 reserved for the Monogram, so
 * the upgrade causes ZERO layout change and zero layout shift: the Monogram
 * renders underneath from first paint and tiles fade in over it as they load
 * (the page never waits on OMDb).
 *
 * Degradation ladder (every step a designed state, per the spec):
 *
 *   ≥2 title ids, 4 posters resolve   → 2×2 mosaic (ideal)
 *   ≥2 title ids, 2–3 posters resolve → mosaic stays a mosaic; each FAILED
 *                                       tile becomes a FallbackArt square
 *                                       (gradient + title initials), revealed
 *                                       only once every tile has settled so a
 *                                       doomed mosaic never flashes fallbacks
 *   0–1 posters resolve               → the WHOLE slot collapses to the
 *                                       Monogram disc (DES-1 floor)
 *   0–1 known-for title ids           → Monogram immediately, and NO OMDb
 *                                       request is ever issued (a one-poster
 *                                       mosaic always ends at the floor, so
 *                                       the request would be waste)
 *
 * Fewer than 4 known-for titles keep the square filled (reduced
 * arrangements): 3 → two tiles up top + one full-width below; 2 → two
 * side-by-side vertical halves. DES-6 draws only the 4-tile ideal; these
 * arrangements are this implementation's reading of "the mosaic stays a
 * mosaic", noted on the ticket Log.
 *
 * Budget: ≤4 lazy requests per page view (one PosterImage per tile, at most
 * MAX_TILES tiles, `loading="lazy"`), no retry on 404. Decorative: the
 * PersonHeader slot is aria-hidden; nothing here is focusable or clickable —
 * the KnownForStrip below the header is the interactive version of the same
 * titles. GOVERNANCE: reads only tconst/primaryTitle — never numVotes,
 * never a denied-fields list; grep this file to prove it.
 */
import { useState } from 'react';

import Monogram from '../Monogram.jsx';
import PosterImage from '../PosterImage.jsx';

/** DES-6 geometry: the dataset also caps knownForTitles at 4 — this is belt. */
const MAX_TILES = 4;
const TILE_GAP = 2;

/**
 * Tile geometry per known-for count so the square never shows a hole:
 * 4 → 2×2; 3 → two squares + one full-width; 2 → two vertical halves.
 */
function tileDims(count, index, size) {
  const half = (size - TILE_GAP) / 2;
  if (count === 2) return { width: half, height: size, span: false };
  if (count === 3 && index === 2) return { width: size, height: half, span: true };
  return { width: half, height: half, span: false };
}

export default function KnownForMosaic({ person, size = 160 }) {
  const [tileStates, setTileStates] = useState({});

  const seen = new Set();
  const titles = (person.knownForTitles ?? [])
    .filter((title) => {
      if (!title?.tconst || seen.has(title.tconst)) return false;
      seen.add(title.tconst);
      return true;
    })
    .slice(0, MAX_TILES);

  const floor = <Monogram text={person.primaryName} seed={person.nconst} size={size} />;

  // 0–1 usable title ids: straight to the floor, zero OMDb requests.
  if (titles.length <= 1) return floor;

  const states = titles.map((title) => tileStates[title.tconst] ?? 'pending');
  const settled = states.every((state) => state !== 'pending');
  const loadedCount = states.filter((state) => state === 'loaded').length;

  // 0–1 posters resolved once everything settled: the whole slot is the disc.
  if (settled && loadedCount <= 1) return floor;

  const settle = (tconst, state) =>
    setTileStates((prev) => (prev[tconst] === state ? prev : { ...prev, [tconst]: state }));

  return (
    <span
      className="known-for-mosaic"
      data-count={titles.length}
      data-settled={settled ? 'true' : undefined}
      style={{ width: size, height: size }}
    >
      <span className="known-for-mosaic__floor">{floor}</span>
      <span className="known-for-mosaic__grid">
        {titles.map((title, index) => {
          const dims = tileDims(titles.length, index, size);
          return (
            <span
              key={title.tconst}
              className={`known-for-mosaic__tile${dims.span ? ' known-for-mosaic__tile--span' : ''}`}
              data-state={states[index]}
            >
              <PosterImage
                tconst={title.tconst}
                title={title.primaryTitle}
                width={dims.width}
                height={dims.height}
                onLoad={() => settle(title.tconst, 'loaded')}
                onError={() => settle(title.tconst, 'failed')}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}
