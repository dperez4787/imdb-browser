/**
 * DES-2 row assembly: union hits in server order first (the client invents no
 * ordering), then Appendix A's 2-titles:1-person prefix fill, deduped by id,
 * capped at the panel limit.
 */
import { describe, expect, it } from 'vitest';

import { assembleRows } from './mergeRows.js';

const T = (n) => ({ tconst: `tt${n}`, primaryTitle: `Title ${n}` });
const N = (n) => ({ nconst: `nm${n}`, primaryName: `Name ${n}` });
const unionT = (n) => ({ __typename: 'Title', ...T(n) });
const unionN = (n) => ({ __typename: 'Name', ...N(n) });

const data = ({ hits = [], titles = [], people = [] } = {}) => ({
  hits,
  titles: { items: titles },
  people: { items: people },
});

describe('assembleRows', () => {
  it('renders union hits in exact server order, branching on __typename', () => {
    const rows = assembleRows(
      data({ hits: [unionT(1), unionN(1), unionT(2), unionN(2)] }),
    );
    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['title', 'tt1'],
      ['person', 'nm1'],
      ['title', 'tt2'],
      ['person', 'nm2'],
    ]);
  });

  it('fills empty union (mid-word typing) 2 titles : 1 person, preserving each list order', () => {
    const rows = assembleRows(
      data({ titles: [T(1), T(2), T(3), T(4), T(5), T(6)], people: [N(1), N(2), N(3)] }),
    );
    expect(rows.map((r) => r.id)).toEqual([
      'tt1', 'tt2', 'nm1', 'tt3', 'tt4', 'nm2', 'tt5', 'tt6',
    ]);
  });

  it('dedupes fill rows already shown as union hits', () => {
    const rows = assembleRows(
      data({
        hits: [unionT(1), unionN(1)],
        titles: [T(1), T(2)],
        people: [N(1), N(2)],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1', 'tt2', 'nm2']);
  });

  it('fills from the other list when one runs out', () => {
    const titlesOnly = assembleRows(data({ titles: [T(1), T(2), T(3)] }));
    expect(titlesOnly.map((r) => r.id)).toEqual(['tt1', 'tt2', 'tt3']);

    const peopleOnly = assembleRows(data({ people: [N(1), N(2), N(3)] }));
    expect(peopleOnly.map((r) => r.id)).toEqual(['nm1', 'nm2', 'nm3']);

    const peopleHeavy = assembleRows(
      data({ titles: [T(1)], people: [N(1), N(2), N(3)] }),
    );
    expect(peopleHeavy.map((r) => r.id)).toEqual(['tt1', 'nm1', 'nm2', 'nm3']);
  });

  it('caps at the row limit (8), union hits first', () => {
    const rows = assembleRows(
      data({
        hits: [unionT(1), unionT(2), unionN(1)],
        titles: [T(3), T(4), T(5), T(6), T(7), T(8)],
        people: [N(2), N(3), N(4)],
      }),
      8,
    );
    expect(rows).toHaveLength(8);
    expect(rows.slice(0, 3).map((r) => r.id)).toEqual(['tt1', 'tt2', 'nm1']);
    // Fill continues 2:1 after the union block.
    expect(rows.slice(3).map((r) => r.id)).toEqual(['tt3', 'tt4', 'nm2', 'tt5', 'tt6']);
  });

  it('tolerates missing/empty payload shapes', () => {
    expect(assembleRows(undefined)).toEqual([]);
    expect(assembleRows({})).toEqual([]);
    expect(assembleRows(data())).toEqual([]);
  });
});
