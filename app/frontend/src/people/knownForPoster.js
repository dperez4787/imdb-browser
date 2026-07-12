/**
 * Card-variant poster pick (IMDB-9, DES-6 "Behavior") — denial-safe BY
 * CONSTRUCTION under the router's field governance:
 *
 *   - PRIMARY rule: the first `knownForTitles` entry, in dataset order —
 *     IMDb's own curation, an ungoverned signal. This is the pick whenever
 *     `Rating.numVotes` is denied (today: denied to everyone, policy rev 8),
 *     because transparent redact mode strips the field from `data` and the
 *     entries simply carry no vote counts.
 *   - OPPORTUNISTIC upgrade: when the fetched data DOES carry numVotes
 *     values (the field was granted at fetch time), the pick upgrades to the
 *     client-side max-voted entry. A grant therefore improves the pick on
 *     the next fresh fetch with no redeploy; a denial silently reverts it.
 *
 * Both rules read only data the rendering query already fetched — never an
 * extra GraphQL or OMDb request, never an error state, never the DES-8
 * restricted treatment (numVotes here is a heuristic input, not a displayed
 * fact — architecture § Person visuals). No treatment DEPENDS on the
 * governed field: `numVotes` is only ever compared when present.
 */

/**
 * Pick the known-for title whose poster represents this person on a card.
 * Returns the chosen title entry, or null when there is nothing usable
 * (no entries / no `tconst` anywhere) — the caller's cue for the Monogram.
 */
export function pickKnownForPoster(knownForTitles) {
  const candidates = (knownForTitles ?? []).filter((title) => title?.tconst);
  if (candidates.length === 0) return null;

  const voted = candidates.filter((title) => title.rating?.numVotes != null);
  if (voted.length === 0) return candidates[0]; // denial-safe primary rule

  return voted.reduce((best, title) =>
    title.rating.numVotes > best.rating.numVotes ? title : best,
  );
}
