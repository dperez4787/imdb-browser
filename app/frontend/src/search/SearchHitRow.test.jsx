/**
 * SearchHitRow (DES-2 row anatomy): the muted metadata line drops missing
 * fields silently, the votes parenthetical is opportunistic (governed field —
 * present renders, absent disappears, never a placeholder), person rows get
 * the Monogram disc and professions with the "Person" fallback.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SearchHitRow, {
  compactVotes,
  professionsLine,
  titleMetaLine,
  titleTypeLabel,
} from './SearchHitRow.jsx';

const renderRow = (row, props = {}) =>
  render(
    <ul role="listbox">
      <SearchHitRow
        row={row}
        optionId="opt-0"
        selected={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        {...props}
      />
    </ul>,
  );

describe('titleMetaLine', () => {
  it('renders "year · type · ★ rating (votes)" when everything is present', () => {
    expect(
      titleMetaLine({
        startYear: 1972,
        titleType: 'movie',
        rating: { averageRating: 9.2, numVotes: 2_145_672 },
      }),
    ).toBe('1972 · Movie · ★ 9.2 (2.1M)');
  });

  it('silently drops the votes parenthetical while numVotes is absent (governed field)', () => {
    expect(
      titleMetaLine({ startYear: 1972, titleType: 'movie', rating: { averageRating: 9.2 } }),
    ).toBe('1972 · Movie · ★ 9.2');
  });

  it('drops any missing field from the line, and returns null when nothing is known', () => {
    expect(titleMetaLine({ titleType: 'tvSeries' })).toBe('Series');
    expect(titleMetaLine({ startYear: 2019 })).toBe('2019');
    expect(titleMetaLine({})).toBeNull();
  });
});

describe('labels and formats', () => {
  it('maps title types to display words', () => {
    expect(titleTypeLabel('tvSeries')).toBe('Series');
    expect(titleTypeLabel('tvMiniSeries')).toBe('Mini-series');
    expect(titleTypeLabel('movie')).toBe('Movie');
    expect(titleTypeLabel('somethingNew')).toBe('SomethingNew');
  });

  it('compacts vote counts (2.1M / 34K)', () => {
    expect(compactVotes(2_145_672)).toBe('2.1M');
    expect(compactVotes(34_120)).toBe('34K');
    expect(compactVotes(950)).toBe('950');
  });

  it('prettifies professions, caps at 3, falls back to "Person"', () => {
    expect(professionsLine(['actor', 'casting_director'])).toBe('Actor · Casting Director');
    expect(professionsLine(['a', 'b', 'c', 'd'].map(() => 'actor')).split('·')).toHaveLength(3);
    expect(professionsLine([])).toBe('Person');
    expect(professionsLine(undefined)).toBe('Person');
  });
});

describe('SearchHitRow rendering', () => {
  it('title row: poster thumb + primary title + metadata line', () => {
    renderRow({
      kind: 'title',
      id: 'tt0068646',
      entity: {
        tconst: 'tt0068646',
        primaryTitle: 'The Godfather',
        startYear: 1972,
        titleType: 'movie',
        rating: { averageRating: 9.2 },
      },
    });
    expect(screen.getByRole('option')).toHaveTextContent('The Godfather');
    expect(screen.getByRole('option')).toHaveTextContent('1972 · Movie · ★ 9.2');
    expect(document.querySelector('img[loading="lazy"]')).not.toBeNull();
  });

  it('person row: Monogram disc (never an image), name, professions', () => {
    renderRow({
      kind: 'person',
      id: 'nm0000338',
      entity: {
        nconst: 'nm0000338',
        primaryName: 'Francis Ford Coppola',
        primaryProfessions: ['director', 'writer'],
      },
    });
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Francis Ford Coppola');
    expect(option).toHaveTextContent('Director · Writer');
    expect(option.querySelector('img')).toBeNull();
    expect(option.querySelector('.monogram')).toHaveTextContent('FF');
  });

  it('marks the selected row for the combobox (aria-selected + modifier class)', () => {
    renderRow(
      { kind: 'person', id: 'nm1', entity: { nconst: 'nm1', primaryName: 'Some One' } },
      { selected: true },
    );
    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option.className).toContain('search-hit--selected');
  });
});
