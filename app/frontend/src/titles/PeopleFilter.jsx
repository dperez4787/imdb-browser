/**
 * PeopleFilter (IMDB-6, DES-3): the `withPeople` control — a chip list plus an
 * inline `+ add person` autocomplete, plus the ALL/ANY match radio that
 * appears only with ≥2 people.
 *
 * The autocomplete reuses `useUniversalSearch` (the omnibox's hook) in
 * people-only mode by reading its `people` alias — no new query, no new
 * request path. Selecting a suggestion adds the person's `nconst` to the URL
 * state (`people` param) and its display name to a session map the view owns,
 * so chips read as names this session; a fresh URL load that only carries
 * nconsts shows the nconst until it is resolved (round-trip determinism rides
 * on the nconst, not the label).
 */
import { useState } from 'react';

import Monogram from '../Monogram.jsx';
import { useUniversalSearch } from '../graphql/searchHooks.js';

const SUGGESTION_LIMIT = 6;

export default function PeopleFilter({
  people,
  mode,
  personLabel = (id) => id,
  onAdd,
  onRemove,
  onModeChange,
}) {
  const [text, setText] = useState('');
  const { data, enabled } = useUniversalSearch(text);
  const selected = new Set(people);
  const suggestions = (data?.people?.items ?? [])
    .filter((person) => !selected.has(person.nconst))
    .slice(0, SUGGESTION_LIMIT);

  const add = (person) => {
    onAdd(person.nconst, person.primaryName);
    setText('');
  };

  return (
    <div className="people-filter">
      {people.length > 0 && (
        <ul className="people-filter__chips">
          {people.map((nconst) => (
            <li key={nconst} className="people-chip">
              <span className="people-chip__label">{personLabel(nconst)}</span>
              <button
                type="button"
                className="people-chip__remove"
                aria-label={`Remove ${personLabel(nconst)}`}
                onClick={() => onRemove(nconst)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="people-filter__add">
        <input
          type="text"
          className="people-filter__input"
          aria-label="Add person"
          placeholder="+ add person"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {enabled && suggestions.length > 0 && (
          <ul className="people-filter__suggestions" role="listbox" aria-label="People">
            {suggestions.map((person) => (
              <li key={person.nconst} role="option" aria-selected="false">
                <button
                  type="button"
                  className="people-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(person)}
                >
                  <Monogram text={person.primaryName} seed={person.nconst} size={24} />
                  <span className="people-suggestion__name">{person.primaryName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {people.length >= 2 && (
        <fieldset className="people-filter__mode">
          <legend>match:</legend>
          <label>
            <input
              type="radio"
              name="peopleMode"
              checked={mode !== 'ANY'}
              onChange={() => onModeChange('ALL')}
            />
            all of these
          </label>
          <label>
            <input
              type="radio"
              name="peopleMode"
              checked={mode === 'ANY'}
              onChange={() => onModeChange('ANY')}
            />
            any of these
          </label>
        </fieldset>
      )}
    </div>
  );
}
