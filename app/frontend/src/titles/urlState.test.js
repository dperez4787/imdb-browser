/**
 * urlState (IMDB-6): the URL⇄state contract that makes `/titles` shareable.
 * The two round-trips, the filter→variables (query-key) mapping, the capped
 * totals / pager bounds math, and the chip derivation — all pure, no DOM.
 */
import { describe, expect, it } from 'vitest';

import {
  buildVariables,
  DEFAULT_SORT,
  defaultState,
  deriveChips,
  hasAnyFilter,
  isNextDisabled,
  isPrevDisabled,
  lastReachablePage,
  MAX_PAGE,
  PAGE_SIZE,
  pageLabel,
  parseState,
  RATING_VOTES_FLOOR,
  stateToSearchParams,
  totalLabel,
} from './urlState.js';

const sp = (query) => new URLSearchParams(query);

describe('parse ⇄ serialize round-trips', () => {
  it('state → params → state is identity for a fully-specified state', () => {
    const state = {
      ...defaultState(),
      q: 'alien',
      genres: ['Horror', 'Sci-Fi'],
      genresAll: ['Drama'],
      types: ['movie', 'tvSeries'],
      yearFrom: 1979,
      yearTo: 2020,
      runtimeFrom: 90,
      runtimeTo: 200,
      ratingFrom: 7,
      ratingTo: 9,
      votesFrom: 1000,
      adult: true,
      people: ['nm0000116', 'nm0000228'],
      peopleMode: 'ANY',
      cats: ['director'],
      sort: 'RATING_DESC',
      page: 3,
    };
    expect(parseState(stateToSearchParams(state))).toEqual(state);
  });

  it('params → state → params is a stable canonical string', () => {
    const canonical = stateToSearchParams({
      ...defaultState(),
      genres: ['Horror', 'Sci-Fi'],
      types: ['movie'],
      ratingFrom: 7,
      sort: 'YEAR_DESC',
      page: 2,
    }).toString();
    const reserialized = stateToSearchParams(parseState(sp(canonical))).toString();
    expect(reserialized).toBe(canonical);
  });

  it('omits every default — the zero state serializes to an empty query', () => {
    expect(stateToSearchParams(defaultState()).toString()).toBe('');
  });

  it('multi-values are comma-separated; page is 1-based and omitted at 1', () => {
    const params = stateToSearchParams({ ...defaultState(), genres: ['A', 'B', 'C'], page: 1 });
    expect(params.get('genres')).toBe('A,B,C');
    expect(params.has('page')).toBe(false);
    expect(stateToSearchParams({ ...defaultState(), page: 4 }).get('page')).toBe('4');
  });

  it('non-default flags only appear when set: adult=1, peopleMode=ANY, sort≠default', () => {
    expect(stateToSearchParams(defaultState()).has('adult')).toBe(false);
    expect(stateToSearchParams(defaultState()).has('peopleMode')).toBe(false);
    expect(stateToSearchParams(defaultState()).has('sort')).toBe(false);
    const params = stateToSearchParams({
      ...defaultState(),
      adult: true,
      peopleMode: 'ANY',
      sort: 'RATING_DESC',
    });
    expect(params.get('adult')).toBe('1');
    expect(params.get('peopleMode')).toBe('ANY');
    expect(params.get('sort')).toBe('RATING_DESC');
  });

  it('parses comma lists, trims blanks, and clamps page into [1, MAX_PAGE]', () => {
    const state = parseState(sp('genres=Horror,,Drama&page=0'));
    expect(state.genres).toEqual(['Horror', 'Drama']);
    expect(state.page).toBe(1);
    expect(parseState(sp('page=99999')).page).toBe(MAX_PAGE);
  });

  it('RELEVANCE sort degrades to the default without a q (and survives with one)', () => {
    expect(parseState(sp('sort=RELEVANCE')).sort).toBe(DEFAULT_SORT);
    expect(parseState(sp('q=alien&sort=RELEVANCE')).sort).toBe('RELEVANCE');
    expect(parseState(sp('sort=BOGUS')).sort).toBe(DEFAULT_SORT);
  });
});

describe('buildVariables — URL state → GraphQL request (the query-key payload)', () => {
  it('maps a genre selection to filter.genresAny and always carries the API defaults', () => {
    const vars = buildVariables({ ...defaultState(), genres: ['Horror'] });
    expect(vars.filter.genresAny).toEqual(['Horror']);
    expect(vars.filter.includeAdult).toBe(false);
    expect(vars.filter.peopleMode).toBe('ALL');
    expect(vars.limit).toBe(PAGE_SIZE);
    expect(vars.offset).toBe(0);
    expect(vars.sort).toBe(DEFAULT_SORT);
  });

  it('maps every rail control to its TitleSearchFilter field', () => {
    const { filter } = buildVariables({
      ...defaultState(),
      types: ['movie'],
      yearFrom: 1990,
      yearTo: 2000,
      ratingFrom: 7.5,
      adult: true,
      people: ['nm1'],
      peopleMode: 'ANY',
    });
    expect(filter).toMatchObject({
      titleTypes: ['movie'],
      startYearFrom: 1990,
      startYearTo: 2000,
      ratingFrom: 7.5,
      includeAdult: true,
      withPeople: ['nm1'],
      peopleMode: 'ANY',
    });
  });

  it('offset = (page − 1) × 24, capped so it never exceeds 10,000', () => {
    expect(buildVariables({ ...defaultState(), page: 3 }).offset).toBe(48);
    // page 417 is the deepest: 416 × 24 = 9984 ≤ 10,000.
    expect(buildVariables({ ...defaultState(), page: MAX_PAGE }).offset).toBe(9984);
    expect(buildVariables({ ...defaultState(), page: MAX_PAGE }).offset).toBeLessThanOrEqual(10_000);
  });

  it('Rating sort injects the votesFrom floor; an explicit URL votesFrom wins', () => {
    expect(buildVariables({ ...defaultState(), sort: 'RATING_DESC' }).filter.votesFrom).toBe(
      RATING_VOTES_FLOOR,
    );
    expect(
      buildVariables({ ...defaultState(), sort: 'RATING_DESC', votesFrom: 5000 }).filter.votesFrom,
    ).toBe(5000);
    // Non-rating sorts add no implicit floor.
    expect(buildVariables(defaultState()).filter.votesFrom).toBeUndefined();
  });
});

describe('capped totals + pager bounds', () => {
  it('totalLabel: plain count, singular, and the 10,000+ cap', () => {
    expect(totalLabel(12437, false)).toBe('12,437 titles');
    expect(totalLabel(1, false)).toBe('1 title');
    expect(totalLabel(0, false)).toBe('0 titles');
    expect(totalLabel(10000, true)).toBe('10,000+ titles');
  });

  it('lastReachablePage: ceil(total/24), min 1, never past 417; capped → 417', () => {
    expect(lastReachablePage(0, false)).toBe(1);
    expect(lastReachablePage(25, false)).toBe(2);
    expect(lastReachablePage(48, false)).toBe(2);
    expect(lastReachablePage(9999999, false)).toBe(MAX_PAGE);
    expect(lastReachablePage(10000, true)).toBe(MAX_PAGE);
  });

  it('pageLabel reads "Page N of M" and "Page N of 417+" when capped', () => {
    expect(pageLabel(2, 5976, false)).toBe('Page 2 of 249');
    expect(pageLabel(2, 10000, true)).toBe(`Page 2 of ${MAX_PAGE}+`);
  });

  it('Prev disabled on page 1; Next disabled on the last (and last capped) page', () => {
    expect(isPrevDisabled(1)).toBe(true);
    expect(isPrevDisabled(2)).toBe(false);
    expect(isNextDisabled(2, 48, false)).toBe(true); // 48 titles = 2 pages
    expect(isNextDisabled(1, 48, false)).toBe(false);
    expect(isNextDisabled(MAX_PAGE, 10000, true)).toBe(true);
    expect(isNextDisabled(MAX_PAGE - 1, 10000, true)).toBe(false);
  });
});

describe('deriveChips + hasAnyFilter', () => {
  const rich = {
    ...defaultState(),
    q: 'alien',
    genres: ['Horror'],
    types: ['movie'],
    yearFrom: 1979,
    yearTo: 2020,
    ratingFrom: 7,
    votesFrom: 1000, // uncontrolled param — must still appear as a chip
    adult: true,
    cats: ['director'], // uncontrolled param
    people: ['nm1'],
  };

  it('emits a chip per set filter, including params the rail renders no control for', () => {
    const chips = deriveChips(rich, { typeLabel: (t) => t.toUpperCase() });
    const keys = chips.map((c) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'q',
        'genre:Horror',
        'type:movie',
        'year',
        'ratingFrom',
        'votesFrom',
        'adult',
        'cat:director',
        'person:nm1',
      ]),
    );
    expect(chips.find((c) => c.key === 'type:movie').label).toBe('MOVIE');
    expect(chips.find((c) => c.key === 'year').label).toBe('1979–2020');
    expect(chips.find((c) => c.key === 'votesFrom').label).toBe('≥ 1,000 votes');
    expect(deriveChips(defaultState())).toHaveLength(0);
  });

  it("a chip's remove() clears exactly its filter and resets page to 1", () => {
    const start = { ...defaultState(), genres: ['Horror', 'Drama'], page: 5 };
    const chip = deriveChips(start).find((c) => c.key === 'genre:Horror');
    const next = chip.remove(start);
    expect(next.genres).toEqual(['Drama']);
    expect(next.page).toBe(1);
  });

  it('removing the q chip also drops a now-orphaned RELEVANCE sort', () => {
    const start = { ...defaultState(), q: 'alien', sort: 'RELEVANCE' };
    const next = deriveChips(start).find((c) => c.key === 'q').remove(start);
    expect(next.q).toBeUndefined();
    expect(next.sort).toBe(DEFAULT_SORT);
  });

  it('hasAnyFilter ignores sort/page but sees any real filter', () => {
    expect(hasAnyFilter(defaultState())).toBe(false);
    expect(hasAnyFilter({ ...defaultState(), sort: 'YEAR_DESC', page: 4 })).toBe(false);
    expect(hasAnyFilter({ ...defaultState(), genres: ['Horror'] })).toBe(true);
  });
});
