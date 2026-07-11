/**
 * FilterRail (IMDB-6, DES-3): the left rail. Composes the API-driven facet
 * groups (genres, title types) with live contextual counts, the year range,
 * rating minimum, people filter, the Include-adult toggle, and Clear all.
 * Every control writes URL state through the handlers the view passes; the
 * rail holds no filter state of its own.
 *
 * `isAdult` is excluded by default — the Include-adult checkbox is the only
 * way in (DES-3). While the index is unbuilt the view hides the rail's
 * (empty) facet groups by not mounting the rail at all.
 */
import FacetGroup from './FacetGroup.jsx';
import PeopleFilter from './PeopleFilter.jsx';
import RatingMinSelect from './RatingMinSelect.jsx';
import YearRangeInput from './YearRangeInput.jsx';

export default function FilterRail({
  state,
  genreValues,
  typeValues,
  facetsStatus,
  onRetryFacets,
  typeLabel,
  personLabel,
  onToggleGenre,
  onToggleType,
  onYearChange,
  onRatingChange,
  onAddPerson,
  onRemovePerson,
  onPeopleMode,
  onToggleAdult,
  onClearAll,
  chips,
}) {
  return (
    <aside className="filter-rail" aria-label="Filters">
      <div className="filter-rail__head">
        <h2 className="filter-rail__title">Filters</h2>
        {chips.length > 0 && (
          <button type="button" className="link-button" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>

      <FacetGroup
        title="Genres"
        noun="genres"
        values={genreValues}
        selected={state.genres}
        onToggle={onToggleGenre}
        status={facetsStatus}
        onRetry={onRetryFacets}
      />

      <FacetGroup
        title="Type"
        noun="title types"
        values={typeValues}
        selected={state.types}
        onToggle={onToggleType}
        labelFor={typeLabel}
        status={facetsStatus}
        onRetry={onRetryFacets}
      />

      <div className="filter-rail__group">
        <h3 className="facet-group__title">Year</h3>
        <YearRangeInput from={state.yearFrom} to={state.yearTo} onChange={onYearChange} />
      </div>

      <div className="filter-rail__group">
        <RatingMinSelect value={state.ratingFrom} onChange={onRatingChange} />
      </div>

      <div className="filter-rail__group">
        <h3 className="facet-group__title">People</h3>
        <PeopleFilter
          people={state.people}
          mode={state.peopleMode}
          personLabel={personLabel}
          onAdd={onAddPerson}
          onRemove={onRemovePerson}
          onModeChange={onPeopleMode}
        />
      </div>

      <div className="filter-rail__group">
        <label className="adult-toggle">
          <input type="checkbox" checked={state.adult} onChange={onToggleAdult} />
          Include adult
        </label>
      </div>
    </aside>
  );
}
