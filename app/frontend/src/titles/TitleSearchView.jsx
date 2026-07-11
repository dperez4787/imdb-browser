/**
 * TitleSearchView (IMDB-6, DES-3) — the `/titles` page: filter rail + toolbar
 * + results grid + paginator, with the URL as the single source of truth.
 *
 * URL↔state: params → parseState → the rail/chips/grid; every control writes
 * state back through `commit` (replace, one history entry per settled change).
 * Query variables come from buildVariables(state) so the cache key, the
 * request, and the shareable URL stay in lockstep — a fresh URL load
 * reproduces the identical view.
 *
 * Facets: value lists from the global `facets` query (useFacets) — never
 * hard-coded — with LIVE contextual counts from the current search response
 * (useTitleSearch), so narrowing one dimension re-counts the others. Governed
 * numVotes is carried optimistically but never rendered here (DES-3).
 *
 * States (DES-3): index-never-built (rebuiltAt null) replaces the whole view
 * with an explainer and hides the empty rail; first load shows 12 skeleton
 * cards; a filter/page change keeps previous cards dimmed under a 2px amber
 * progress bar; no-match and error states render their own copy.
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useFacets, useSearchInfo } from '../graphql/hooks.js';
import { useTitleSearch } from '../graphql/useTitleSearch.js';
import SearchFreshness from '../search/SearchFreshness.jsx';
import { titleTypeLabel } from '../search/SearchHitRow.jsx';
import ActiveFilterChips from './ActiveFilterChips.jsx';
import FilterRail from './FilterRail.jsx';
import Paginator from './Paginator.jsx';
import ResultsGrid, { SkeletonGrid } from './ResultsGrid.jsx';
import SortSelect from './SortSelect.jsx';
import {
  buildVariables,
  defaultState,
  deriveChips,
  hasAnyFilter,
  parseState,
  stateToSearchParams,
  totalLabel,
} from './urlState.js';

/** Vocab value order + the current filter's contextual count (0 when absent). */
function mergeCounts(vocab, contextualMap, haveContextual) {
  return vocab.map(({ value, count }) => ({
    value,
    count: haveContextual ? (contextualMap?.get(value) ?? 0) : count,
  }));
}

function toYearValue(raw) {
  const trimmed = String(raw).trim();
  if (trimmed === '') return undefined;
  const n = Math.trunc(Number(trimmed));
  return Number.isFinite(n) ? n : undefined;
}

export default function TitleSearchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseState(searchParams), [searchParams]);
  const variables = useMemo(() => buildVariables(state), [state]);

  const facets = useFacets();
  const freshness = useSearchInfo();
  const search = useTitleSearch(variables);

  // Session name map so people chips read as names this session; a fresh URL
  // load carrying only nconsts falls back to the nconst until resolved.
  const [personNames, setPersonNames] = useState({});
  const resultsRef = useRef(null);

  const commit = (next) => setSearchParams(stateToSearchParams(next), { replace: true });
  const patch = (partial, resetPage = true) =>
    commit({ ...state, ...partial, ...(resetPage ? { page: 1 } : {}) });
  const toggle = (list, value) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const info = freshness.data?.searchInfo;
  const indexUnbuilt = info != null && info.rebuiltAt == null;

  const genreVocab = facets.data?.facets?.genres ?? [];
  const typeVocab = facets.data?.facets?.titleTypes ?? [];
  const facetsStatus = facets.isError ? 'error' : facets.isPending ? 'loading' : 'ready';

  const result = search.data?.searchTitles;
  const haveContextual = Boolean(result);
  const contextual = useMemo(() => {
    const map = {};
    for (const bucket of result?.facets ?? []) {
      map[bucket.dimension] = new Map((bucket.values ?? []).map((v) => [v.value, v.count]));
    }
    return map;
  }, [result]);

  const genreValues = mergeCounts(genreVocab, contextual.GENRES, haveContextual);
  const typeValues = mergeCounts(typeVocab, contextual.TITLE_TYPES, haveContextual);

  const typeLabel = (value) => titleTypeLabel(value) ?? value;
  const personLabel = (nconst) => personNames[nconst] ?? nconst;
  const chips = deriveChips(state, { typeLabel, personLabel });

  const items = result?.items ?? [];
  const total = result?.total;
  const totalIsCapped = result?.totalIsCapped ?? false;
  const countText = search.data ? totalLabel(total, totalIsCapped) : '— titles';
  const showProgress = search.isFetching && !search.isPending;

  const goToPage = (page) => {
    commit({ ...state, page });
    resultsRef.current?.scrollIntoView?.({ block: 'start' });
  };

  const addPerson = (nconst, name) => {
    if (name) setPersonNames((prev) => ({ ...prev, [nconst]: name }));
    if (!state.people.includes(nconst)) patch({ people: [...state.people, nconst] });
  };

  if (indexUnbuilt) {
    return (
      <section className="titles-view titles-view--message">
        <div className="titles-explainer">
          <p>The search index hasn’t been built yet — titles will appear after the first rebuild.</p>
        </div>
      </section>
    );
  }

  let gridArea;
  if (search.isError) {
    gridArea = (
      <div className="titles-message" role="alert">
        <p>⚠ Search isn’t responding.</p>
        <button type="button" className="button" onClick={() => search.refetch()}>
          Retry
        </button>
      </div>
    );
  } else if (search.isPending || (items.length === 0 && freshness.isPending)) {
    // The second clause guards DES-3's rule that "Nothing matches these
    // filters" must NEVER appear in the index-never-built state: an empty
    // result can't be classified until searchInfo says the index exists.
    gridArea = <SkeletonGrid count={12} />;
  } else if (items.length === 0) {
    gridArea = (
      <div className="titles-message">
        <p>Nothing matches these filters.</p>
        {hasAnyFilter(state) && (
          <button type="button" className="button" onClick={() => commit(defaultState())}>
            Clear all filters
          </button>
        )}
      </div>
    );
  } else {
    gridArea = (
      <>
        <ResultsGrid items={items} dimmed={search.isPlaceholderData} />
        <Paginator
          page={state.page}
          total={total}
          totalIsCapped={totalIsCapped}
          onPage={goToPage}
        />
      </>
    );
  }

  return (
    <section className="titles-view">
      <FilterRail
        state={state}
        genreValues={genreValues}
        typeValues={typeValues}
        facetsStatus={facetsStatus}
        onRetryFacets={() => facets.refetch()}
        typeLabel={typeLabel}
        personLabel={personLabel}
        chips={chips}
        onToggleGenre={(value) => patch({ genres: toggle(state.genres, value) })}
        onToggleType={(value) => patch({ types: toggle(state.types, value) })}
        onYearChange={(which, raw) =>
          patch({ [which === 'from' ? 'yearFrom' : 'yearTo']: toYearValue(raw) })
        }
        onRatingChange={(value) => patch({ ratingFrom: value })}
        onAddPerson={addPerson}
        onRemovePerson={(nconst) => patch({ people: state.people.filter((p) => p !== nconst) })}
        onPeopleMode={(mode) => patch({ peopleMode: mode })}
        onToggleAdult={(event) => patch({ adult: event.target.checked })}
        onClearAll={() => commit(defaultState())}
      />

      <div className="titles-main">
        <div className="titles-toolbar">
          <span className="titles-count">{countText}</span>
          {info && <SearchFreshness searchInfo={info} />}
          <SortSelect
            value={state.sort}
            hasQuery={Boolean(state.q)}
            onChange={(sort) => patch({ sort })}
          />
        </div>

        <ActiveFilterChips
          chips={chips}
          onRemove={(chip) => commit(chip.remove(state))}
          onClearAll={() => commit(defaultState())}
        />

        {showProgress && <div className="search-progress" role="presentation" />}

        <div className="titles-results" ref={resultsRef}>
          {gridArea}
        </div>
      </div>
    </section>
  );
}
