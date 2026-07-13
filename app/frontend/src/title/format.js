/**
 * Pure display formatting + credit grouping for the title detail page
 * (IMDB-7, DES-4). No fetching, no React — colocated tests in
 * format.test.js.
 *
 * DES-4's partial-data rule governs every formatter here: an absent field
 * drops its segment silently (formatters return null, callers filter), and
 * nothing ever renders "N/A".
 */

/** '2h 55m' / '45m' — null when runtime is absent/invalid. */
export function formatRuntime(runtimeMinutes) {
  if (typeof runtimeMinutes !== 'number' || !Number.isFinite(runtimeMinutes) || runtimeMinutes <= 0)
    return null;
  const hours = Math.floor(runtimeMinutes / 60);
  const minutes = runtimeMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** '1972' / '2008–2013' (en dash) — null when no startYear. */
export function formatYears(startYear, endYear) {
  if (startYear == null) return null;
  if (endYear != null && endYear !== startYear) return `${startYear}–${endYear}`;
  return String(startYear);
}

const votesFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Compact vote count per DES-4: 2132880 → '2.1M'. Null when absent. */
export function formatVotes(numVotes) {
  if (typeof numVotes !== 'number' || !Number.isFinite(numVotes)) return null;
  return votesFormatter.format(numVotes);
}

/**
 * Humanize a titleType value from the data ('tvSeries' → 'TV Series',
 * 'movie' → 'Movie') — generic camelCase splitting, no hard-coded type
 * list, with the one orthographic fix that 'Tv' reads as 'TV'.
 */
export function formatTitleType(titleType) {
  if (!titleType) return null;
  return String(titleType)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .map((word) => (word === 'Tv' ? 'TV' : word))
    .join(' ');
}

/**
 * Group header text from a data category value: underscores become spaces
 * ('casting_director' → 'casting director'); the uppercasing is CSS
 * (text-transform), so the DOM keeps the data's own words — never a
 * hard-coded category list (DES-4).
 */
export function formatCategory(category) {
  return String(category ?? '').replace(/_/g, ' ');
}

/**
 * Compact episode marker for hierarchy rows (IMDB-20): 'S1E7' — partial
 * placements degrade to 'S1' / 'E7', and null when neither number exists,
 * per the partial-data rule (callers drop the segment silently).
 */
export function formatEpisodeMarker(episode) {
  if (!episode) return null;
  const parts = [
    episode.seasonNumber != null ? `S${episode.seasonNumber}` : null,
    episode.episodeNumber != null ? `E${episode.episodeNumber}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('') : null;
}

/**
 * Group a series' episode list into season groups for the Episodes section
 * (IMDB-20): one group per distinct seasonNumber in FIRST-APPEARANCE order
 * (the API returns episodes ordered by season/episode, so this preserves
 * its ordering rather than imposing one), with `seasonNumber: null`
 * episodes collected under the 'Specials' label. Entries without a tconst
 * or a primaryTitle are dropped (nothing to link). Never throws: no
 * episodes → no groups.
 *
 * @param {Array|null|undefined} episodes  Title children from useTitleEpisodes
 * @returns {Array<{key: string, label: string, episodes: Array}>}
 */
export function groupEpisodesBySeason(episodes) {
  if (!Array.isArray(episodes)) return [];
  const groups = new Map(); // insertion order = API first-appearance order
  for (const ep of episodes) {
    if (!ep?.tconst || !ep?.primaryTitle) continue;
    const season = ep.episode?.seasonNumber ?? null;
    const key = season == null ? 'specials' : `season-${season}`;
    if (!groups.has(key)) {
      groups.set(key, { key, label: season == null ? 'Specials' : `Season ${season}`, episodes: [] });
    }
    groups.get(key).episodes.push(ep);
  }
  return [...groups.values()];
}

/**
 * DES-4 group order: directors, writers, cast, then remaining categories in
 * API order. The data's cast categories are 'actor'/'actress' (verified
 * live) — they fill the "cast" slot in their API order. This is an ORDERING
 * preference over well-known categories, not a category allowlist: any
 * category the API sends renders as its own group.
 */
function categoryPriority(category) {
  if (category === 'director') return 0;
  if (category === 'writer') return 1;
  if (category === 'actor' || category === 'actress') return 2;
  return 3;
}

/**
 * Group principals into DES-4's credit groups: one group per category
 * present in the data, entries in API order (defensively re-sorted by
 * `ordering` where present), groups ordered director → writer → cast slot →
 * remaining categories by first appearance. Entries without a person stub
 * or a category are dropped (nothing to render). Never throws on missing
 * input: no principals → no groups.
 *
 * @param {Array|null|undefined} principals
 * @returns {Array<{category: string, entries: Array}>}
 */
export function groupCredits(principals) {
  if (!Array.isArray(principals)) return [];
  const groups = new Map(); // insertion order = API first-appearance order
  for (const entry of principals) {
    if (!entry?.category || !entry?.name?.primaryName) continue;
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry);
  }
  const ordered = [...groups.entries()].map(([category, entries], appearanceIndex) => ({
    category,
    entries: entries
      .slice()
      .sort((a, b) => (a.ordering ?? Number.MAX_SAFE_INTEGER) - (b.ordering ?? Number.MAX_SAFE_INTEGER)),
    appearanceIndex,
  }));
  ordered.sort(
    (a, b) =>
      categoryPriority(a.category) - categoryPriority(b.category) ||
      a.appearanceIndex - b.appearanceIndex,
  );
  return ordered.map(({ category, entries }) => ({ category, entries }));
}
