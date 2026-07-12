/**
 * personFormat (IMDB-8, DES-5): the full lifespan denied-vs-missing matrix
 * (DES-8's confusion rule — the two families of state must never look
 * alike), the professions line, and the filmography grouping rules
 * (acting-first, API order for the rest, year-descending rows, unknown
 * years last).
 */
import { describe, expect, it } from 'vitest';

import {
  BIRTH_YEAR_COORDINATE,
  DEATH_YEAR_COORDINATE,
  formatProfessions,
  groupFilmography,
  lifespanState,
} from './personFormat.js';

const BOTH_DENIED = [BIRTH_YEAR_COORDINATE, DEATH_YEAR_COORDINATE];

describe('lifespanState — DES-5 matrix', () => {
  it('values known, nothing denied: 1940 – 2015', () => {
    expect(lifespanState({ birthYear: 1940, deathYear: 2015 }, [])).toEqual({
      kind: 'line',
      birth: { kind: 'year', value: 1940 },
      death: { kind: 'year', value: 2015 },
    });
  });

  it('living, nothing denied: 1940 – (death slot follows its ordinary missing rule)', () => {
    expect(lifespanState({ birthYear: 1940, deathYear: null }, [])).toEqual({
      kind: 'line',
      birth: { kind: 'year', value: 1940 },
      death: { kind: 'missing' },
    });
  });

  it('CONFUSION RULE: no recorded birth year and nothing denied → the line is ABSENT', () => {
    expect(lifespanState({ birthYear: null, deathYear: null }, [])).toEqual({ kind: 'absent' });
    // Rating.numVotes denied elsewhere in the document must not leak in.
    expect(lifespanState({ birthYear: null, deathYear: null }, ['Rating.numVotes'])).toEqual({
      kind: 'absent',
    });
  });

  it('both years denied → the line-level variant, never absent, never two pills', () => {
    expect(lifespanState({ birthYear: null, deathYear: null }, BOTH_DENIED)).toEqual({
      kind: 'both-denied',
    });
  });

  it('birth denied, death known: ▨▨ – 2015', () => {
    expect(
      lifespanState({ birthYear: null, deathYear: 2015 }, BOTH_DENIED),
    ).toEqual({
      kind: 'line',
      birth: { kind: 'denied' },
      death: { kind: 'year', value: 2015 },
    });
  });

  it('death denied, birth known: 1940 – ▨▨ (the live default with one grant)', () => {
    expect(lifespanState({ birthYear: 1940, deathYear: null }, [DEATH_YEAR_COORDINATE])).toEqual({
      kind: 'line',
      birth: { kind: 'year', value: 1940 },
      death: { kind: 'denied' },
    });
  });

  it('one slot denied, the other genuinely absent: the absent slot follows its missing rule within the line', () => {
    expect(lifespanState({ birthYear: null, deathYear: null }, [DEATH_YEAR_COORDINATE])).toEqual({
      kind: 'line',
      birth: { kind: 'missing' },
      death: { kind: 'denied' },
    });
  });

  it('a slot with a real VALUE is never denied (deniedFields is document-scoped)', () => {
    // A grant flip mid-session: value present, coordinate stale in the list.
    expect(lifespanState({ birthYear: 1940, deathYear: 2015 }, BOTH_DENIED)).toEqual({
      kind: 'line',
      birth: { kind: 'year', value: 1940 },
      death: { kind: 'year', value: 2015 },
    });
  });

  it('never throws on missing input', () => {
    expect(lifespanState(null, undefined)).toEqual({ kind: 'absent' });
    expect(lifespanState({}, undefined)).toEqual({ kind: 'absent' });
  });
});

describe('formatProfessions', () => {
  it("max 3, ' · ' joined, data's words title-cased", () => {
    expect(formatProfessions(['actor', 'director', 'producer', 'writer'])).toBe(
      'Actor · Director · Producer',
    );
  });

  it('underscores become spaces', () => {
    expect(formatProfessions(['casting_director'])).toBe('Casting Director');
  });

  it('null when there is nothing to show', () => {
    expect(formatProfessions([])).toBeNull();
    expect(formatProfessions(null)).toBeNull();
    expect(formatProfessions(undefined)).toBeNull();
  });
});

describe('groupFilmography — DES-5 grouping rules', () => {
  const entry = (category, tconst, startYear, ordering = 1) => ({
    ordering,
    category,
    characters: null,
    title: { tconst, primaryTitle: `T ${tconst}`, startYear, rating: null },
  });

  it('acting categories first, then remaining categories in API first-appearance order', () => {
    const groups = groupFilmography([
      entry('self', 'tt1', 1990),
      entry('director', 'tt2', 1996),
      entry('actor', 'tt3', 1971),
      entry('producer', 'tt4', 2000),
      entry('actress', 'tt5', 1980),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      'actor',
      'actress',
      'self',
      'director',
      'producer',
    ]);
  });

  it('rows within a group sort year-descending, unknown years last, stable for ties', () => {
    const groups = groupFilmography([
      entry('actor', 'tt1', 1971),
      entry('actor', 'tt2', null),
      entry('actor', 'tt3', 2019),
      entry('actor', 'tt4', 2019, 2),
      entry('actor', 'tt5', 1995),
    ]);
    expect(groups[0].entries.map((e) => e.title.tconst)).toEqual([
      'tt3',
      'tt4',
      'tt5',
      'tt1',
      'tt2',
    ]);
  });

  it('drops entries without a category or a title stub; empty input → no groups', () => {
    expect(
      groupFilmography([
        entry('actor', 'tt1', 1971),
        { ordering: 2, category: null, title: { tconst: 'tt2', primaryTitle: 'X' } },
        { ordering: 3, category: 'actor', title: null },
        null,
      ]),
    ).toHaveLength(1);
    expect(groupFilmography([])).toEqual([]);
    expect(groupFilmography(null)).toEqual([]);
    expect(groupFilmography(undefined)).toEqual([]);
  });
});
