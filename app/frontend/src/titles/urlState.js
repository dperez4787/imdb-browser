/**
 * URL ⇄ state for the faceted title view (IMDB-6).
 *
 * The ONE module that maps `/titles` query params to a filter/sort/page state
 * and back (docs/architecture.md § "Frontend routing & URL scheme"): param
 * names mirror `TitleSearchFilter` fields, multi-values are comma-separated,
 * DEFAULTS ARE OMITTED so canonical URLs stay short, `page` is 1-based, page
 * size is fixed at 24, and `offset = (page − 1) × 24` is capped at 10,000 (the
 * API rejects deeper paging). Components never read `location.search`
 * themselves — they call these helpers, so the URL is the single source of
 * truth and deep links round-trip deterministically.
 *
 * Two round-trips hold by construction and are pinned in urlState.test.js:
 *   params → parseState → stateToSearchParams → identical canonical params
 *   state  → stateToSearchParams → parseState → identical state
 *
 * `buildState`/`parseState` also cover params the v1 rail renders NO control
 * for (`q`, `genresAll`, `runtimeFrom/To`, `ratingTo`, `votesFrom`, `cats`):
 * they still filter results and surface as removable ActiveFilterChips, so a
 * shared URL is never silently wider than the rail shows.
 */

export const PAGE_SIZE = 24;
export const MAX_OFFSET = 10_000;
/** Deepest reachable page: offset (page−1)×24 must stay ≤ 10,000 → page ≤ 417. */
export const MAX_PAGE = Math.floor(MAX_OFFSET / PAGE_SIZE) + 1;
export const DEFAULT_SORT = 'POPULARITY_DESC';
/** DES-3: the Rating sort's documented guard against ten-vote 9.9s. */
export const RATING_VOTES_FLOOR = 1000;

/** SortSelect options; RELEVANCE surfaces only while a `q` is active (DES-3). */
export const SORT_OPTIONS = Object.freeze([
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'RATING_DESC', label: 'Rating' },
  { value: 'YEAR_DESC', label: 'Newest' },
  { value: 'YEAR_ASC', label: 'Oldest' },
  { value: 'RELEVANCE', label: 'Relevance', requiresQuery: true },
]);

const SORT_VALUES = new Set(SORT_OPTIONS.map((o) => o.value));

/** The zero state: every param at its default (serializes to an empty query). */
export function defaultState() {
  return {
    q: undefined,
    genres: [],
    genresAll: [],
    types: [],
    yearFrom: undefined,
    yearTo: undefined,
    runtimeFrom: undefined,
    runtimeTo: undefined,
    ratingFrom: undefined,
    ratingTo: undefined,
    votesFrom: undefined,
    adult: false,
    people: [],
    peopleMode: 'ALL',
    cats: [],
    sort: DEFAULT_SORT,
    page: 1,
  };
}

function readList(params, key) {
  const raw = params.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readInt(params, key) {
  const raw = params.get(key);
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function readFloat(params, key) {
  const raw = params.get(key);
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Parse a URLSearchParams (or anything with `.get`) into the view state.
 * Unknown/invalid values fall back to defaults; `page` is clamped to
 * [1, MAX_PAGE] so no hand-typed URL can push `offset` past the API cap.
 */
export function parseState(params) {
  const q = (params.get('q') ?? '').trim() || undefined;

  let sort = params.get('sort');
  if (!sort || !SORT_VALUES.has(sort)) sort = DEFAULT_SORT;
  // RELEVANCE is only meaningful with a text query; drop it otherwise.
  if (sort === 'RELEVANCE' && !q) sort = DEFAULT_SORT;

  const pageRaw = readInt(params, 'page');
  const page = pageRaw && pageRaw >= 1 ? clamp(pageRaw, 1, MAX_PAGE) : 1;

  return {
    q,
    genres: readList(params, 'genres'),
    genresAll: readList(params, 'genresAll'),
    types: readList(params, 'types'),
    yearFrom: readInt(params, 'yearFrom'),
    yearTo: readInt(params, 'yearTo'),
    runtimeFrom: readInt(params, 'runtimeFrom'),
    runtimeTo: readInt(params, 'runtimeTo'),
    ratingFrom: readFloat(params, 'ratingFrom'),
    ratingTo: readFloat(params, 'ratingTo'),
    votesFrom: readInt(params, 'votesFrom'),
    adult: params.get('adult') === '1',
    people: readList(params, 'people'),
    peopleMode: params.get('peopleMode') === 'ANY' ? 'ANY' : 'ALL',
    cats: readList(params, 'cats'),
    sort,
    page,
  };
}

/**
 * Serialize state to a canonical URLSearchParams — defaults omitted, fixed
 * key order, multi-values comma-joined. Inverse of parseState for canonical
 * input.
 */
export function stateToSearchParams(state) {
  const params = new URLSearchParams();
  const setList = (key, list) => {
    if (list && list.length) params.set(key, list.join(','));
  };
  const setNum = (key, n) => {
    if (n != null) params.set(key, String(n));
  };

  if (state.q) params.set('q', state.q);
  setList('genres', state.genres);
  setList('genresAll', state.genresAll);
  setList('types', state.types);
  setNum('yearFrom', state.yearFrom);
  setNum('yearTo', state.yearTo);
  setNum('runtimeFrom', state.runtimeFrom);
  setNum('runtimeTo', state.runtimeTo);
  setNum('ratingFrom', state.ratingFrom);
  setNum('ratingTo', state.ratingTo);
  setNum('votesFrom', state.votesFrom);
  if (state.adult) params.set('adult', '1');
  setList('people', state.people);
  if (state.peopleMode === 'ANY') params.set('peopleMode', 'ANY');
  setList('cats', state.cats);
  if (state.sort && state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.page && state.page > 1) params.set('page', String(state.page));

  return params;
}

/** Convenience: the canonical query string (no leading `?`). */
export function stateToSearch(state) {
  return stateToSearchParams(state).toString();
}

/**
 * The effective sort — RELEVANCE degrades to the default without a query, so
 * the sort the request uses matches what a fresh URL load would compute.
 */
export function effectiveSort(state) {
  return state.sort === 'RELEVANCE' && !state.q ? DEFAULT_SORT : state.sort;
}

/**
 * Build the GraphQL request variables from state: the `TitleSearchFilter`
 * object (only set fields, plus the always-present includeAdult/peopleMode
 * for a stable cache key), the effective sort, the fixed page limit, and the
 * capped offset. Clamps everything the API would reject so no interaction can
 * produce a BAD_REQUEST.
 */
export function buildVariables(state) {
  const filter = {
    includeAdult: state.adult === true,
    peopleMode: state.peopleMode === 'ANY' ? 'ANY' : 'ALL',
  };
  if (state.q) filter.query = state.q;
  if (state.genres.length) filter.genresAny = state.genres;
  if (state.genresAll.length) filter.genresAll = state.genresAll;
  if (state.types.length) filter.titleTypes = state.types;
  if (state.yearFrom != null) filter.startYearFrom = state.yearFrom;
  if (state.yearTo != null) filter.startYearTo = state.yearTo;
  if (state.runtimeFrom != null) filter.runtimeFrom = state.runtimeFrom;
  if (state.runtimeTo != null) filter.runtimeTo = state.runtimeTo;
  if (state.ratingFrom != null) filter.ratingFrom = state.ratingFrom;
  if (state.ratingTo != null) filter.ratingTo = state.ratingTo;
  if (state.people.length) filter.withPeople = state.people;
  if (state.cats.length) filter.peopleCategories = state.cats;

  const sort = effectiveSort(state);
  // Explicit votesFrom in the URL wins; otherwise Rating sort injects the
  // floor so a shared Rating link is deterministic on a fresh load.
  let votesFrom = state.votesFrom;
  if (votesFrom == null && sort === 'RATING_DESC') votesFrom = RATING_VOTES_FLOOR;
  if (votesFrom != null) filter.votesFrom = votesFrom;

  const page = clamp(state.page ?? 1, 1, MAX_PAGE);
  const offset = Math.min((page - 1) * PAGE_SIZE, MAX_OFFSET);
  return { filter, sort, limit: PAGE_SIZE, offset };
}

/** Deepest page the API will serve for this result set. */
export function lastReachablePage(total, totalIsCapped) {
  if (totalIsCapped) return MAX_PAGE;
  const pages = Math.ceil((total ?? 0) / PAGE_SIZE);
  return clamp(pages || 1, 1, MAX_PAGE);
}

export function isPrevDisabled(page) {
  return (page ?? 1) <= 1;
}

export function isNextDisabled(page, total, totalIsCapped) {
  return (page ?? 1) >= lastReachablePage(total, totalIsCapped);
}

/** "Page 2 of 249" / "Page 2 of 417+" when the API stops counting at 10k. */
export function pageLabel(page, total, totalIsCapped) {
  const p = page ?? 1;
  if (totalIsCapped) return `Page ${p} of ${MAX_PAGE}+`;
  return `Page ${p} of ${lastReachablePage(total, totalIsCapped)}`;
}

/** "12,437 titles" / "10,000+ titles" when capped / "1 title". */
export function totalLabel(total, totalIsCapped) {
  if (totalIsCapped) return `${MAX_OFFSET.toLocaleString('en-US')}+ titles`;
  const n = total ?? 0;
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'title' : 'titles'}`;
}

/** Any filter set (ignores sort/page) — gates the chips row and no-results copy. */
export function hasAnyFilter(state) {
  return Boolean(
    state.q ||
      state.genres.length ||
      state.genresAll.length ||
      state.types.length ||
      state.yearFrom != null ||
      state.yearTo != null ||
      state.runtimeFrom != null ||
      state.runtimeTo != null ||
      state.ratingFrom != null ||
      state.ratingTo != null ||
      state.votesFrom != null ||
      state.adult ||
      state.people.length ||
      state.cats.length,
  );
}

function withPageReset(next) {
  return { ...next, page: 1 };
}

function rangeLabel(from, to, suffix = '') {
  if (from != null && to != null) return `${from}–${to}${suffix}`;
  if (from != null) return `from ${from}${suffix}`;
  return `to ${to}${suffix}`;
}

/**
 * The removable summary chips (DES-3 "Active-filter summary"): every set
 * filter — rail-backed AND uncontrolled — as one legible line mirroring the
 * URL. Each chip's `remove(state)` returns the next state (page reset to 1).
 *
 * @param {object} state
 * @param {{typeLabel?: (v:string)=>string, personLabel?: (v:string)=>string}} [labels]
 */
export function deriveChips(state, labels = {}) {
  const typeLabel = labels.typeLabel ?? ((v) => v);
  const personLabel = labels.personLabel ?? ((v) => v);
  const chips = [];

  if (state.q) {
    chips.push({
      key: 'q',
      label: `“${state.q}”`,
      remove: (s) =>
        withPageReset({
          ...s,
          q: undefined,
          sort: s.sort === 'RELEVANCE' ? DEFAULT_SORT : s.sort,
        }),
    });
  }
  for (const g of state.genres) {
    chips.push({
      key: `genre:${g}`,
      label: g,
      remove: (s) => withPageReset({ ...s, genres: s.genres.filter((x) => x !== g) }),
    });
  }
  for (const g of state.genresAll) {
    chips.push({
      key: `genreAll:${g}`,
      label: `all: ${g}`,
      remove: (s) => withPageReset({ ...s, genresAll: s.genresAll.filter((x) => x !== g) }),
    });
  }
  for (const t of state.types) {
    chips.push({
      key: `type:${t}`,
      label: typeLabel(t),
      remove: (s) => withPageReset({ ...s, types: s.types.filter((x) => x !== t) }),
    });
  }
  if (state.yearFrom != null || state.yearTo != null) {
    chips.push({
      key: 'year',
      label: rangeLabel(state.yearFrom, state.yearTo),
      remove: (s) => withPageReset({ ...s, yearFrom: undefined, yearTo: undefined }),
    });
  }
  if (state.runtimeFrom != null || state.runtimeTo != null) {
    chips.push({
      key: 'runtime',
      label: rangeLabel(state.runtimeFrom, state.runtimeTo, ' min'),
      remove: (s) => withPageReset({ ...s, runtimeFrom: undefined, runtimeTo: undefined }),
    });
  }
  if (state.ratingFrom != null) {
    chips.push({
      key: 'ratingFrom',
      label: `≥ ${Number(state.ratingFrom).toFixed(1)}`,
      remove: (s) => withPageReset({ ...s, ratingFrom: undefined }),
    });
  }
  if (state.ratingTo != null) {
    chips.push({
      key: 'ratingTo',
      label: `≤ ${Number(state.ratingTo).toFixed(1)}`,
      remove: (s) => withPageReset({ ...s, ratingTo: undefined }),
    });
  }
  if (state.votesFrom != null) {
    chips.push({
      key: 'votesFrom',
      label: `≥ ${Number(state.votesFrom).toLocaleString('en-US')} votes`,
      remove: (s) => withPageReset({ ...s, votesFrom: undefined }),
    });
  }
  if (state.adult) {
    chips.push({
      key: 'adult',
      label: 'adult included',
      remove: (s) => withPageReset({ ...s, adult: false }),
    });
  }
  for (const p of state.people) {
    chips.push({
      key: `person:${p}`,
      label: personLabel(p),
      remove: (s) => withPageReset({ ...s, people: s.people.filter((x) => x !== p) }),
    });
  }
  for (const c of state.cats) {
    chips.push({
      key: `cat:${c}`,
      label: `role: ${c}`,
      remove: (s) => withPageReset({ ...s, cats: s.cats.filter((x) => x !== c) }),
    });
  }
  return chips;
}
