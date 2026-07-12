/**
 * PersonPosterBadge (IMDB-9, DES-6 card variant, `poster+badge`): a single
 * known-for poster thumb representing a person on card surfaces, with a
 * small (16px) Monogram badge bottom-left so the thumb still reads as a
 * PERSON, not a title. Same ladder as the mosaic, depth 1:
 *
 *   poster resolves          → poster + monogram badge (badge appears with it)
 *   while loading            → the plain Monogram shows underneath; the
 *                              poster fades in over it (no shift, no wait)
 *   poster 404s / no picks   → plain Monogram — NEVER FallbackArt here (the
 *                              card is about the person; a title-initials
 *                              square would misidentify them)
 *
 * Budget: ≤1 lazy OMDb request per card (zero when there is nothing to pick).
 * The poster is chosen by pickKnownForPoster — denial-safe first-entry rule
 * with the opportunistic numVotes upgrade (see knownForPoster.js). Reads only
 * data the card's own list query already fetched.
 *
 * SCOPE (DES-6 tier table): person cards on larger surfaces — today no such
 * surface exists (autocomplete rows are explicitly Monogram-only, and the
 * people-filter chips carry no knownForTitles data), so this ships consumed
 * only through PersonVisual, ready for the first person grid.
 */
import { useState } from 'react';

import Monogram from '../Monogram.jsx';
import PosterImage from '../PosterImage.jsx';
import { pickKnownForPoster } from './knownForPoster.js';

const BADGE_SIZE = 16;

export default function PersonPosterBadge({ person, width = 40, height = 60 }) {
  const [state, setState] = useState('pending'); // pending | loaded | failed
  const pick = pickKnownForPoster(person.knownForTitles);
  const monogramSize = Math.min(width, height);

  if (!pick || state === 'failed') {
    return <Monogram text={person.primaryName} seed={person.nconst} size={monogramSize} />;
  }

  return (
    <span
      className="person-poster-badge"
      data-state={state}
      style={{ width, height }}
    >
      <span className="person-poster-badge__floor">
        <Monogram text={person.primaryName} seed={person.nconst} size={monogramSize} />
      </span>
      <PosterImage
        tconst={pick.tconst}
        title={pick.primaryTitle}
        width={width}
        height={height}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
      <span className="person-poster-badge__badge">
        <Monogram text={person.primaryName} seed={person.nconst} size={BADGE_SIZE} />
      </span>
    </span>
  );
}
