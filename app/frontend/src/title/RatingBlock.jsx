/**
 * RatingBlock (IMDB-7, DES-4) — amber star + rating, compact votes beneath.
 * Reusable: DES-3's cards consume the inline variant when IMDB-6 wants it.
 *
 * The votes line is the GOVERNED slot (`Rating.numVotes`, denied to everyone
 * at policy rev 8). Its three states are distinct BY DESIGN — the amended
 * IMDB-7 AC's confusion rule:
 *
 *   1. value present            → compact '2.1M votes'
 *   2. coordinate denied        → the inline RestrictedValue pill (DES-8),
 *                                 label "Vote count", in the votes line's
 *                                 exact box — stars and every other fact
 *                                 unaffected, zero layout jump on grant flips
 *   3. no rating, nothing denied→ the WHOLE block absent (silent absence,
 *                                 DES-4's partial-data rule)
 *
 * "No rating data" (block gone) must never look like "vote count restricted"
 * (block present, votes line redacted). A numVotes that is merely null while
 * NOT denied drops the votes line silently — never the pill (DES-8 rule 2).
 *
 * Edge (deliberate): redactedFields is DOCUMENT-scoped, so a title with no
 * rating at all can still report Rating.numVotes denied. No stars → no
 * block: the pill asserts "a value exists here", and without a rating row
 * there is no `here` — absence wins, exactly like state 3.
 */
import RestrictedValue, { isRestricted } from '../components/RestrictedValue.jsx';
import { formatVotes } from './format.js';

export const NUM_VOTES_COORDINATE = 'Rating.numVotes';

export default function RatingBlock({ rating, deniedFields }) {
  const averageRating = rating?.averageRating;
  if (averageRating == null) return null; // state 3: whole block absent

  const votes = formatVotes(rating?.numVotes);
  const votesRestricted = votes == null && isRestricted(deniedFields, NUM_VOTES_COORDINATE);

  return (
    <div className="rating-block">
      <div className="rating-block__stars">
        <span className="rating-block__star" aria-hidden="true">
          ★
        </span>{' '}
        <span aria-label={`Rated ${averageRating} out of 10`}>{averageRating.toFixed(1)}</span>
      </div>
      {votes != null && <div className="rating-block__votes">{votes} votes</div>}
      {votesRestricted && (
        <div className="rating-block__votes">
          <RestrictedValue coordinate={NUM_VOTES_COORDINATE} label="Vote count" />
        </div>
      )}
    </div>
  );
}
