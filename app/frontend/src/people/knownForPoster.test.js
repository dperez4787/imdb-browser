/**
 * pickKnownForPoster (IMDB-9, DES-6 card variant) — the denial-safe pick:
 * first knownForTitles entry in dataset order, upgraded to the client-side
 * max-voted entry ONLY when the fetched data carries numVotes values (the
 * governed field was granted). Pure data-in/data-out: no request in any
 * branch, no error state, no restricted treatment.
 */
import { describe, expect, it } from 'vitest';

import { pickKnownForPoster } from './knownForPoster.js';

const title = (tconst, primaryTitle, numVotes) => ({
  tconst,
  primaryTitle,
  rating:
    numVotes === undefined
      ? { averageRating: 7.5 } // the live denied shape: numVotes stripped, sibling intact
      : { averageRating: 7.5, numVotes },
});

describe('denial-safe primary rule (numVotes denied → absent from data)', () => {
  it('picks the FIRST entry in dataset order — IMDb curation, an ungoverned signal', () => {
    const pick = pickKnownForPoster([
      title('tt0070666', 'Serpico'),
      title('tt0068646', 'The Godfather'),
    ]);
    expect(pick.tconst).toBe('tt0070666');
  });

  it('handles rating: null entries the same way (no rating row at all)', () => {
    const pick = pickKnownForPoster([
      { tconst: 'tt0000001', primaryTitle: 'First', rating: null },
      { tconst: 'tt0000002', primaryTitle: 'Second', rating: null },
    ]);
    expect(pick.tconst).toBe('tt0000001');
  });

  it('skips entries with no tconst — the first USABLE entry wins', () => {
    const pick = pickKnownForPoster([
      { tconst: null, primaryTitle: 'No Id', rating: null },
      title('tt0000002', 'Second'),
    ]);
    expect(pick.tconst).toBe('tt0000002');
  });
});

describe('opportunistic upgrade (numVotes granted → values present)', () => {
  it('upgrades to the client-side MAX-VOTED entry', () => {
    const pick = pickKnownForPoster([
      title('tt0070666', 'Serpico', 130_000),
      title('tt0068646', 'The Godfather', 2_100_000),
      title('tt0072890', 'Dog Day Afternoon', 280_000),
    ]);
    expect(pick.tconst).toBe('tt0068646');
  });

  it('compares only entries that CARRY a value — a title with no rating row never blocks the upgrade', () => {
    const pick = pickKnownForPoster([
      { tconst: 'tt0000001', primaryTitle: 'Unrated', rating: null },
      title('tt0000002', 'Voted', 500),
      title('tt0000003', 'More Voted', 900),
    ]);
    expect(pick.tconst).toBe('tt0000003');
  });

  it('treats numVotes: 0 as a present value, not an absence', () => {
    const pick = pickKnownForPoster([title('tt0000001', 'Zero Votes', 0)]);
    expect(pick.tconst).toBe('tt0000001');
  });
});

describe('the null cue (caller renders the Monogram)', () => {
  it.each([[null], [undefined], [[]]])('returns null for %s', (value) => {
    expect(pickKnownForPoster(value)).toBeNull();
  });

  it('returns null when no entry has a tconst', () => {
    expect(pickKnownForPoster([{ tconst: '', primaryTitle: 'X', rating: null }])).toBeNull();
  });
});
