/**
 * PersonVisual (IMDB-9): DES-6's named identity slot, now with the spec's
 * `treatment` prop — the ONE switch between the three person treatments:
 *
 *   - `monogram`     → the DES-1 disc (v1, shipped by IMDB-5/IMDB-8); zero
 *                      image requests — autocomplete-tier surfaces stay here
 *   - `mosaic`       → KnownForMosaic, the person-page header (≤4 lazy OMDb
 *                      requests, full degradation ladder)
 *   - `poster+badge` → PersonPosterBadge, the card variant (≤1 lazy request,
 *                      denial-safe pick)
 *
 * Internals change per treatment; the box does not — callers own the layout
 * slot (DES-5's contract). `person` needs nconst + primaryName always, and
 * knownForTitles for the image-bearing treatments (missing/empty is a
 * designed state: both ladders floor at the Monogram).
 */
import Monogram from '../Monogram.jsx';
import KnownForMosaic from './KnownForMosaic.jsx';
import PersonPosterBadge from './PersonPosterBadge.jsx';

export default function PersonVisual({ person, treatment = 'monogram', size = 160 }) {
  if (treatment === 'mosaic') {
    return <KnownForMosaic person={person} size={size} />;
  }
  if (treatment === 'poster+badge') {
    // DES-6 card thumbs keep DES-2's 2:3 thumb proportions at any size.
    return <PersonPosterBadge person={person} width={size} height={Math.round(size * 1.5)} />;
  }
  return <Monogram text={person.primaryName} seed={person.nconst} size={size} />;
}
