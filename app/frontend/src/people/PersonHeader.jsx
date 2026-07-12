/**
 * PersonHeader (IMDB-8, DES-5): the PersonVisual slot + name (h1) + lifespan
 * line + muted professions (max 3).
 *
 * PersonVisual is the square 160px identity slot. Since IMDB-9 (DES-6) it
 * renders the KNOWN-FOR POSTER MOSAIC — the person shown as their work —
 * inside the exact box DES-5 reserved for the Monogram, so the upgrade is
 * zero layout change by construction. The Monogram disc is still the first
 * paint and the floor of the whole degradation ladder (≤1 poster resolvable
 * → the disc, each failed tile → FallbackArt; see KnownForMosaic.jsx), and
 * the mosaic issues at most 4 lazy OMDb requests per page view. Decorative:
 * aria-hidden, not focusable, not clickable — the KnownForStrip below is the
 * interactive version of the same titles.
 *
 * The LIFESPAN LINE is the governed slot (`Name.birthYear`/`Name.deathYear`,
 * denied to everyone at policy rev 8). Its states come from
 * personFormat.js#lifespanState and are distinct BY DESIGN (DES-5's matrix,
 * DES-8's confusion rule):
 *
 *   1. values known, nothing denied → `1940 – 2015` / `1940 –` (living)
 *   2. no recorded birth year, nothing denied → the line renders NOTHING
 *      (ordinary missing data — never the pill)
 *   3. one year denied → the line renders with the inline RestrictedValue
 *      pill (2.5em, labels "Birth year"/"Death year") in that slot alone:
 *      `▨▨🔒▨▨ – 2015` / `1940 – ▨▨🔒▨▨`; a genuinely absent other year
 *      follows its ordinary missing rule within the line
 *   4. both denied → the line-level variant (one pill + small-caps
 *      RESTRICTED, label "Lifespan")
 *
 * Grant flips swap pill ↔ year in place: the line renders in both states, so
 * there is zero layout jump (sole edge: a grant revealing a genuinely absent
 * birth year collapses the line per rule 2 — DES-8's acknowledged
 * "revealed-absent" case).
 */
import RestrictedValue from '../components/RestrictedValue.jsx';
import PersonVisual from './PersonVisual.jsx';
import {
  BIRTH_YEAR_COORDINATE,
  DEATH_YEAR_COORDINATE,
  formatProfessions,
  lifespanState,
} from './personFormat.js';

/** One year slot inside the lifespan line: year, inline pill, or nothing. */
function YearSlot({ slot, coordinate, label }) {
  if (slot.kind === 'year') return <span className="person-header__year">{slot.value}</span>;
  if (slot.kind === 'denied')
    return <RestrictedValue coordinate={coordinate} label={label} width="2.5em" />;
  return null; // missing: the slot's ordinary missing rule within the line
}

function LifespanLine({ person, deniedFields }) {
  const state = lifespanState(person, deniedFields);
  if (state.kind === 'absent') return null;
  if (state.kind === 'both-denied') {
    return (
      <p className="person-header__lifespan">
        <RestrictedValue
          coordinate={`${BIRTH_YEAR_COORDINATE},${DEATH_YEAR_COORDINATE}`}
          label="Lifespan"
          variant="line"
        />
      </p>
    );
  }
  return (
    <p className="person-header__lifespan">
      <YearSlot slot={state.birth} coordinate={BIRTH_YEAR_COORDINATE} label="Birth year" />
      {' – '}
      <YearSlot slot={state.death} coordinate={DEATH_YEAR_COORDINATE} label="Death year" />
    </p>
  );
}

export default function PersonHeader({ person, deniedFields }) {
  const professions = formatProfessions(person.primaryProfessions);
  return (
    <header className="person-header">
      <div className="person-header__visual" aria-hidden="true">
        <PersonVisual person={person} treatment="mosaic" size={160} />
      </div>
      <div className="person-header__main">
        <h1 className="person-header__name">{person.primaryName}</h1>
        <LifespanLine person={person} deniedFields={deniedFields} />
        {professions && <p className="person-header__professions">{professions}</p>}
      </div>
    </header>
  );
}
