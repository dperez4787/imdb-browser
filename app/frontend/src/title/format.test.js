/**
 * format.js (IMDB-7): the fact-line formatters follow DES-4's partial-data
 * rule (absent → null, never "N/A"), and groupCredits produces the DES-4
 * group order — directors, writers, cast, then remaining categories in API
 * order — from the data's own categories, never a hard-coded list.
 */
import { describe, expect, it } from 'vitest';

import {
  formatCategory,
  formatEpisodeMarker,
  formatRuntime,
  formatTitleType,
  formatVotes,
  formatYears,
  groupCredits,
  groupEpisodesBySeason,
} from './format.js';

describe('formatRuntime', () => {
  it('renders hours + minutes: 175 → 2h 55m', () => {
    expect(formatRuntime(175)).toBe('2h 55m');
  });
  it('renders minutes only under an hour, whole hours without a 0m', () => {
    expect(formatRuntime(45)).toBe('45m');
    expect(formatRuntime(120)).toBe('2h');
  });
  it('absent/invalid → null (the segment drops silently)', () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(undefined)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
    expect(formatRuntime('90')).toBeNull();
  });
});

describe('formatYears', () => {
  it('single year, and a range with an en dash for multi-year titles', () => {
    expect(formatYears(1972, null)).toBe('1972');
    expect(formatYears(2008, 2013)).toBe('2008–2013');
  });
  it('same start/end collapses to one year; no startYear → null', () => {
    expect(formatYears(1999, 1999)).toBe('1999');
    expect(formatYears(null, 2013)).toBeNull();
  });
});

describe('formatVotes', () => {
  it('compact-formats per DES-4: 2132880 → 2.1M', () => {
    expect(formatVotes(2132880)).toBe('2.1M');
    expect(formatVotes(950)).toBe('950');
    expect(formatVotes(15200)).toBe('15.2K');
  });
  it('absent → null (the votes line drops, or the pill takes the slot)', () => {
    expect(formatVotes(null)).toBeNull();
    expect(formatVotes(undefined)).toBeNull();
  });
});

describe('formatTitleType', () => {
  it('humanizes the data values generically (no hard-coded type list)', () => {
    expect(formatTitleType('movie')).toBe('Movie');
    expect(formatTitleType('tvSeries')).toBe('TV Series');
    expect(formatTitleType('tvMiniSeries')).toBe('TV Mini Series');
    expect(formatTitleType('videoGame')).toBe('Video Game');
  });
  it('absent → null', () => {
    expect(formatTitleType(null)).toBeNull();
  });
});

describe('formatCategory', () => {
  it('keeps the data’s own words, underscores become spaces (CSS uppercases)', () => {
    expect(formatCategory('casting_director')).toBe('casting director');
    expect(formatCategory('director')).toBe('director');
  });
});

const entry = (ordering, category, name, characters = null) => ({
  ordering,
  category,
  characters,
  name: { nconst: `nm${ordering}`, primaryName: name },
});

describe('groupCredits', () => {
  it('orders groups director → writer → cast slot (actor/actress in API order) → rest in API order', () => {
    // API order mirrors the live tt0068646 shape: actors first, director and
    // writers later, then the long tail of crew categories.
    const principals = [
      entry(1, 'actor', 'Marlon Brando', ['Don Vito Corleone']),
      entry(2, 'actress', 'Diane Keaton', ['Kay Adams']),
      entry(3, 'director', 'Francis Ford Coppola'),
      entry(4, 'writer', 'Mario Puzo'),
      entry(5, 'producer', 'Albert S. Ruddy'),
      entry(6, 'composer', 'Nino Rota'),
      entry(7, 'casting_director', 'Louis DiGiaimo'),
    ];
    expect(groupCredits(principals).map((g) => g.category)).toEqual([
      'director',
      'writer',
      'actor',
      'actress',
      'producer',
      'composer',
      'casting_director',
    ]);
  });

  it('one group per category present in the data — unknown categories render as their own group', () => {
    const principals = [
      entry(1, 'grip_wrangler', 'Some Body'),
      entry(2, 'grip_wrangler', 'Some Body Else'),
    ];
    const groups = groupCredits(principals);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('grip_wrangler');
    expect(groups[0].entries).toHaveLength(2);
  });

  it('entries keep API order within a group (re-sorted by ordering defensively)', () => {
    const principals = [
      entry(9, 'actor', 'Ninth'),
      entry(2, 'actor', 'Second'),
      entry(5, 'actor', 'Fifth'),
    ];
    expect(groupCredits(principals)[0].entries.map((e) => e.name.primaryName)).toEqual([
      'Second',
      'Fifth',
      'Ninth',
    ]);
  });

  it('drops entries with no person or no category, and never throws on missing input', () => {
    expect(groupCredits(null)).toEqual([]);
    expect(groupCredits(undefined)).toEqual([]);
    expect(
      groupCredits([
        { ordering: 1, category: 'actor', name: null },
        { ordering: 2, category: null, name: { nconst: 'nm2', primaryName: 'X' } },
        entry(3, 'actor', 'Kept'),
      ]),
    ).toEqual([
      {
        category: 'actor',
        entries: [entry(3, 'actor', 'Kept')],
      },
    ]);
  });
});

describe('formatEpisodeMarker (IMDB-20)', () => {
  it('compact S#E# for hierarchy rows', () => {
    expect(formatEpisodeMarker({ seasonNumber: 1, episodeNumber: 7 })).toBe('S1E7');
  });
  it('degrades to the parts it has, null when neither exists', () => {
    expect(formatEpisodeMarker({ seasonNumber: 2, episodeNumber: null })).toBe('S2');
    expect(formatEpisodeMarker({ seasonNumber: null, episodeNumber: 5 })).toBe('E5');
    expect(formatEpisodeMarker({ seasonNumber: null, episodeNumber: null })).toBeNull();
    expect(formatEpisodeMarker(null)).toBeNull();
  });
});

const ep = (n, seasonNumber, episodeNumber, primaryTitle = `Ep ${n}`) => ({
  tconst: `tt${n}`,
  primaryTitle,
  startYear: 2008,
  episode: { seasonNumber, episodeNumber },
});

describe('groupEpisodesBySeason (IMDB-20)', () => {
  it('one group per season in first-appearance (API) order, episodes kept in order', () => {
    const groups = groupEpisodesBySeason([ep(1, 1, 1), ep(2, 1, 2), ep(3, 2, 1)]);
    expect(groups.map((g) => g.label)).toEqual(['Season 1', 'Season 2']);
    expect(groups[0].episodes.map((e) => e.tconst)).toEqual(['tt1', 'tt2']);
    expect(groups[1].episodes.map((e) => e.tconst)).toEqual(['tt3']);
  });

  it('seasonNumber null groups under "Specials"', () => {
    const groups = groupEpisodesBySeason([ep(1, 1, 1), ep(2, null, null), ep(3, null, 1)]);
    expect(groups.map((g) => g.label)).toEqual(['Season 1', 'Specials']);
    expect(groups[1].episodes.map((e) => e.tconst)).toEqual(['tt2', 'tt3']);
  });

  it('a missing episode block counts as Specials too (no placement data)', () => {
    const groups = groupEpisodesBySeason([{ tconst: 'tt9', primaryTitle: 'Floating', episode: null }]);
    expect(groups.map((g) => g.label)).toEqual(['Specials']);
  });

  it('drops unlinkable entries and never throws on missing input', () => {
    expect(groupEpisodesBySeason(null)).toEqual([]);
    expect(groupEpisodesBySeason(undefined)).toEqual([]);
    expect(
      groupEpisodesBySeason([
        { tconst: null, primaryTitle: 'No id', episode: { seasonNumber: 1 } },
        { tconst: 'tt1', primaryTitle: null, episode: { seasonNumber: 1 } },
        ep(2, 1, 1, 'Kept'),
      ]),
    ).toEqual([
      { key: 'season-1', label: 'Season 1', episodes: [ep(2, 1, 1, 'Kept')] },
    ]);
  });
});
