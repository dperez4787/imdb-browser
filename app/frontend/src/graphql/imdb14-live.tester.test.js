// @vitest-environment node
/**
 * Tester LIVE probes (IMDB-14 AC 1: "one live integration check recorded on
 * the PR") — independent of the developer's live-router.integration.test.js,
 * and SKIPPED unless LIVE_ROUTER_TOKEN is set so `npm test` stays hermetic:
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * Drives the REAL client module (client.js → errors.js → graphql-request →
 * global fetch) against the live cosmo router; the only substituted seam is
 * auth.js#getIdToken() (a Google OIDC identity token instead of a Firebase ID
 * token — both are accepted JWKS providers per IMDB-3). graphql-request's
 * rawRequest resolves only on a 2xx, so every resolving assertion below is
 * also an assertion that the redaction arrived as HTTP 200, not a 403.
 *
 * Governance facts these probes assume (architecture § Field-level
 * governance, policy revision 8 at verification time): Rating.numVotes,
 * Name.birthYear, Name.deathYear are governed and denied to every identity.
 * If the user has flipped a grant at the governance console since, the
 * deniedFields assertions will fail — that is the test doing its job.
 */
import { describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN),
}));

/** Governed leaf beside ungoverned siblings — the AC 1 / AC 3 shape. */
const GOVERNED_TITLE = `
  query TesterGovernedTitle($tconst: ID!) {
    title(tconst: $tconst) {
      tconst
      primaryTitle
      startYear
      rating {
        averageRating
        numVotes
      }
    }
  }
`;

/** Alias-awareness: the redaction must remove the field under its alias. */
const ALIASED_GOVERNED_TITLE = `
  query TesterAliasedGovernedTitle($tconst: ID!) {
    title(tconst: $tconst) {
      primaryTitle
      rating {
        stars: averageRating
        votes: numVotes
      }
    }
  }
`;

/** All three governed coordinates in one document → union in redactedFields. */
const GOVERNED_NAME = `
  query TesterGovernedName($nconst: ID!) {
    name(nconst: $nconst) {
      nconst
      primaryName
      birthYear
      deathYear
      knownForTitles {
        tconst
        primaryTitle
        rating {
          averageRating
          numVotes
        }
      }
    }
  }
`;

describe.skipIf(!TOKEN)('IMDB-14 live: transparent redact mode through the real client', () => {
  it('selecting Rating.numVotes → HTTP 200, numVotes absent, deniedFields [Rating.numVotes], siblings intact (AC 1 + AC 3)', async () => {
    const { data, deniedFields } = await executeWithDenials(GOVERNED_TITLE, {
      tconst: 'tt0068646',
    });

    // Resolving at all proves the 200 (rawRequest rejects non-2xx) — the
    // denial was not an error, and one denied field blanked nothing:
    expect(data.title.tconst).toBe('tt0068646');
    expect(data.title.primaryTitle).toBe('The Godfather');
    expect(data.title.startYear).toBe(1972);
    expect(data.title.rating.averageRating).toBeGreaterThan(0);
    // The governed leaf is silently absent from data…
    expect(data.title.rating).not.toHaveProperty('numVotes');
    // …and reported to the caller as exactly its coordinate.
    expect(deniedFields).toEqual(['Rating.numVotes']);
  }, 30000);

  it('alias-aware: a governed field is absent under its alias, reported under its coordinate', async () => {
    const { data, deniedFields } = await executeWithDenials(ALIASED_GOVERNED_TITLE, {
      tconst: 'tt0068646',
    });
    expect(data.title.rating.stars).toBeGreaterThan(0);
    expect(data.title.rating).not.toHaveProperty('votes');
    expect(data.title.rating).not.toHaveProperty('numVotes');
    expect(deniedFields).toEqual(['Rating.numVotes']);
  }, 30000);

  it('one document touching all three governed coordinates → union in deniedFields, per-element absence in lists', async () => {
    // Marlon Brando (nm0000008): has recorded birth AND death years in the
    // dataset, so their absence here is redaction, not missing data.
    const { data, deniedFields } = await executeWithDenials(GOVERNED_NAME, {
      nconst: 'nm0000008',
    });

    expect(data.name.primaryName).toBe('Marlon Brando');
    expect(data.name).not.toHaveProperty('birthYear');
    expect(data.name).not.toHaveProperty('deathYear');
    expect(data.name.knownForTitles.length).toBeGreaterThan(0);
    for (const title of data.name.knownForTitles) {
      expect(title.primaryTitle).toBeTruthy(); // ungoverned siblings intact
      if (title.rating) expect(title.rating).not.toHaveProperty('numVotes');
    }
    expect([...deniedFields].sort()).toEqual([
      'Name.birthYear',
      'Name.deathYear',
      'Rating.numVotes',
    ]);
  }, 30000);
});
