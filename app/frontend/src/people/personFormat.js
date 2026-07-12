/**
 * Pure display formatting + credit grouping for the person detail page
 * (IMDB-8, DES-5). No fetching, no React — colocated tests in
 * personFormat.test.js. Mirrors src/title/format.js, with the person page's
 * own rules where DES-5 differs from DES-4 (acting-first group order,
 * year-descending rows, and the governed lifespan matrix).
 */
import { isRestricted } from '../components/RestrictedValue.jsx';

/** The two governed lifespan coordinates (IMDB-14 / DES-8). */
export const BIRTH_YEAR_COORDINATE = 'Name.birthYear';
export const DEATH_YEAR_COORDINATE = 'Name.deathYear';

/**
 * DES-5's lifespan matrix, resolved to one renderable state. The two
 * families of state must never look alike (DES-8's two-rule contract):
 *
 *   - { kind: 'absent' }      — no recorded birth year and NOTHING denied →
 *                               the line renders nothing (ordinary missing
 *                               data).
 *   - { kind: 'both-denied' } — both years redacted → the line renders the
 *                               line-level RestrictedValue (one pill +
 *                               small-caps RESTRICTED, label "Lifespan").
 *   - { kind: 'line', birth, death } — the line renders `birth – death`,
 *     each slot one of:
 *       { kind: 'year', value }  a real year,
 *       { kind: 'denied' }       the inline pill (2.5em, DES-8),
 *       { kind: 'missing' }      renders nothing — a year genuinely absent
 *                                while the OTHER slot is denied or known
 *                                follows its ordinary missing rule within
 *                                the line (`1940 –` for the living).
 *
 * A slot with a real VALUE is never treated as denied even though
 * `deniedFields` is document-scoped: a value that arrived was not redacted
 * for this element (same rule as RatingBlock's votes slot).
 *
 * @param {{birthYear?: number|null, deathYear?: number|null}} person
 * @param {string[]|undefined} deniedFields  from usePersonDetail
 */
export function lifespanState(person, deniedFields) {
  const birthYear = person?.birthYear ?? null;
  const deathYear = person?.deathYear ?? null;
  const birthDenied = birthYear == null && isRestricted(deniedFields, BIRTH_YEAR_COORDINATE);
  const deathDenied = deathYear == null && isRestricted(deniedFields, DEATH_YEAR_COORDINATE);

  if (birthDenied && deathDenied) return { kind: 'both-denied' };
  if (!birthDenied && !deathDenied && birthYear == null) return { kind: 'absent' };

  const slot = (value, denied) => {
    if (denied) return { kind: 'denied' };
    if (value == null) return { kind: 'missing' };
    return { kind: 'year', value };
  };
  return {
    kind: 'line',
    birth: slot(birthYear, birthDenied),
    death: slot(deathYear, deathDenied),
  };
}

/**
 * Professions line per DES-5: max 3, muted, ' · ' joined — data's own words,
 * underscores to spaces, title-cased for display ('casting_director' →
 * 'Casting Director'). Null when there is nothing to show.
 */
export function formatProfessions(primaryProfessions) {
  if (!Array.isArray(primaryProfessions)) return null;
  const shown = primaryProfessions
    .filter(Boolean)
    .slice(0, 3)
    .map((profession) =>
      String(profession)
        .replace(/_/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    );
  return shown.length > 0 ? shown.join(' · ') : null;
}

/** DES-5 group order: acting categories first, then API first-appearance order. */
function categoryPriority(category) {
  return category === 'actor' || category === 'actress' ? 0 : 1;
}

/** Year for row sorting: descending, unknown years last. */
function sortYear(entry) {
  const year = entry?.title?.startYear;
  return typeof year === 'number' && Number.isFinite(year) ? year : Number.MIN_SAFE_INTEGER;
}

/**
 * Group credits into DES-5's filmography groups: one group per category
 * present in the data (headers from the data, never hard-coded), acting
 * categories first, then remaining categories in API first-appearance
 * order; rows within a group year-descending, unknown years last (stable,
 * so equal years keep API order). Entries without a title stub or a
 * category are dropped (nothing to render). Never throws on missing input:
 * no credits → no groups. Mirrors src/title/format.js#groupCredits.
 *
 * @param {Array|null|undefined} credits  Name.credits entries
 * @returns {Array<{category: string, entries: Array}>}
 */
export function groupFilmography(credits) {
  if (!Array.isArray(credits)) return [];
  const groups = new Map(); // insertion order = API first-appearance order
  for (const entry of credits) {
    if (!entry?.category || !entry?.title?.primaryTitle) continue;
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry);
  }
  const ordered = [...groups.entries()].map(([category, entries], appearanceIndex) => ({
    category,
    entries: entries.slice().sort((a, b) => sortYear(b) - sortYear(a)),
    appearanceIndex,
  }));
  ordered.sort(
    (a, b) =>
      categoryPriority(a.category) - categoryPriority(b.category) ||
      a.appearanceIndex - b.appearanceIndex,
  );
  return ordered.map(({ category, entries }) => ({ category, entries }));
}
