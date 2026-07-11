/**
 * Row assembly for the autocomplete panel (IMDB-5, DES-2 "Row assembly" +
 * Appendix A).
 *
 * Union-first: rows come from the unified `search` union in SERVER order —
 * the client invents no ordering. Because the union matches whole words/stems
 * (not prefixes), a mid-word query legitimately returns zero union hits; the
 * remaining rows fill from the two prefix-backed aliases in the same response,
 * per Appendix A: take 2 titles, then 1 person, repeating, preserving each
 * list's server (popularity) order, skipping ids already shown, until the
 * panel cap is reached; when either list runs out, fill from the other.
 * Union rows and fill rows are visually identical — one list.
 *
 * Pure function; tested in mergeRows.test.js. If the union ever gains prefix
 * semantics, this file and the two fill aliases go away (DES-2 Appendix A).
 */

function titleRow(entity) {
  return { kind: 'title', id: entity.tconst, entity };
}

function personRow(entity) {
  return { kind: 'person', id: entity.nconst, entity };
}

/**
 * @param {object} data the UniversalSearch response
 *   ({ hits, titles: {items}, people: {items} })
 * @param {number} limit panel row cap (DES-2: 8)
 * @returns {Array<{kind: 'title'|'person', id: string, entity: object}>}
 */
export function assembleRows(data, limit = 8) {
  const rows = [];
  const seen = new Set();
  const push = (row) => {
    if (row.id && !seen.has(row.id)) {
      seen.add(row.id);
      rows.push(row);
    }
  };

  // 1. Union hits, server order, branch on __typename.
  for (const hit of data?.hits ?? []) {
    if (rows.length >= limit) return rows;
    if (hit?.__typename === 'Title') push(titleRow(hit));
    else if (hit?.__typename === 'Name') push(personRow(hit));
  }

  // 2. Appendix A fill: 2 titles : 1 person, deduped against union hits.
  const titles = (data?.titles?.items ?? []).filter((t) => t?.tconst && !seen.has(t.tconst));
  const people = (data?.people?.items ?? []).filter((n) => n?.nconst && !seen.has(n.nconst));
  let t = 0;
  let p = 0;
  while (rows.length < limit && (t < titles.length || p < people.length)) {
    for (let k = 0; k < 2 && t < titles.length && rows.length < limit; k += 1) {
      push(titleRow(titles[t]));
      t += 1;
    }
    if (p < people.length && rows.length < limit) {
      push(personRow(people[p]));
      p += 1;
    }
  }
  return rows;
}
