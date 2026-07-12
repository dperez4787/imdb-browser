// PosterImage (DES-1 shared visual language, first consumer DES-2): the ONE
// way title posters render. Always 2:3, always lazy-loaded (offscreen slots
// issue no OMDb request), and a missing/404 poster swaps to FallbackArt with
// no layout shift — never a broken image.
//
// The OMDb key below is embedded in client-side URLs BY DESIGN: it is public
// to every browser regardless, and lives in docs/PROJECT-BRIEF.md. This is
// CLAUDE.md's one sanctioned key-in-code exception. OMDb serves TITLE posters
// only — a person is never fetched as an image; DES-6 shows people THROUGH
// their known-for TITLE posters (KnownForMosaic / PersonPosterBadge in
// src/people/), with Monogram/FallbackArt as every ladder's floor.
//
// `onLoad`/`onError` (both optional, IMDB-9) let ladder components track
// whether each tile settled: DES-6's mosaic collapses the WHOLE slot to the
// Monogram when 0–1 posters resolve, which only the parent can know. The
// internal 404 → FallbackArt swap is unchanged and does not depend on them.
import { useState } from 'react';

import FallbackArt from './FallbackArt.jsx';

const OMDB_IMG_KEY = 'db1f8efc';

/** Poster URL for an IMDb title id, e.g. tt3896198. */
export function posterUrl(tconst) {
  return `https://img.omdbapi.com/?i=${encodeURIComponent(tconst)}&apikey=${OMDB_IMG_KEY}`;
}

export default function PosterImage({ tconst, title, width = 40, height = 60, onLoad, onError }) {
  const [failed, setFailed] = useState(false);

  if (!tconst || failed) {
    return <FallbackArt id={tconst} label={title} kind="title" width={width} height={height} />;
  }
  return (
    <img
      className="poster-image"
      src={posterUrl(tconst)}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      onLoad={onLoad}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}
