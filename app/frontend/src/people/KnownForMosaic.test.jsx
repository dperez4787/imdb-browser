/**
 * KnownForMosaic (IMDB-9, DES-6) — every rung of the degradation ladder is a
 * designed state:
 *
 *   4 posters resolve   → 2×2 mosaic
 *   2–3 posters resolve → mosaic stays a mosaic; failed tiles → FallbackArt
 *   0–1 posters resolve → the WHOLE slot is the 160px Monogram disc
 *   0–1 title ids       → Monogram immediately, ZERO OMDb requests
 *   while loading       → Monogram underneath, tiles fade in over it
 *
 * The ≤4-requests budget is asserted structurally (one lazy PosterImage img
 * per tile, never more than 4 tiles), and the governance criterion is
 * grep-proved: the treatment reads no governed field and no denial list.
 */
import { fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { posterUrl } from '../PosterImage.jsx';
import KnownForMosaic from './KnownForMosaic.jsx';

const kf = (n, primaryTitle) => ({
  tconst: `tt000000${n}`,
  primaryTitle,
  startYear: 1970 + n,
  rating: { averageRating: 7 + n / 10 }, // live denied shape: numVotes absent
});

const FOUR = [kf(1, 'Serpico'), kf(2, 'Dog Day Afternoon'), kf(3, 'The Godfather'), kf(4, 'Heat')];

const person = (knownForTitles) => ({
  nconst: 'nm0000199',
  primaryName: 'Al Pacino',
  knownForTitles,
});

const renderMosaic = (titles) =>
  render(<KnownForMosaic person={person(titles)} size={160} />).container;

const imgs = (c) => [...c.querySelectorAll('img.poster-image')];
const tiles = (c) => [...c.querySelectorAll('.known-for-mosaic__tile')];
const mosaic = (c) => c.querySelector('.known-for-mosaic');
const monogram = (c) => c.querySelector('.monogram');

describe('ideal: 4 known-for titles', () => {
  it('renders a 2×2 mosaic: exactly 4 lazy OMDb tiles in dataset order, inside the fixed square', () => {
    const c = renderMosaic(FOUR);
    expect(mosaic(c)).toHaveAttribute('data-count', '4');
    expect(imgs(c)).toHaveLength(4); // the budget: one request per tile, ≤4
    expect(imgs(c).map((i) => i.src)).toEqual(FOUR.map((t) => posterUrl(t.tconst)));
    for (const img of imgs(c)) expect(img).toHaveAttribute('loading', 'lazy');
    // The slot's box is the caller's contract: the mosaic fills exactly it.
    expect(mosaic(c).style.width).toBe('160px');
    expect(mosaic(c).style.height).toBe('160px');
  });

  it('paints the Monogram floor immediately and fades tiles in as each poster loads', () => {
    const c = renderMosaic(FOUR);
    // First paint: the disc is already there; every tile still pending.
    expect(monogram(c)).toHaveTextContent('AP');
    for (const tile of tiles(c)) expect(tile).toHaveAttribute('data-state', 'pending');
    expect(mosaic(c)).not.toHaveAttribute('data-settled');

    fireEvent.load(imgs(c)[0]);
    fireEvent.load(imgs(c)[1]);
    expect(tiles(c)[0]).toHaveAttribute('data-state', 'loaded');
    expect(tiles(c)[1]).toHaveAttribute('data-state', 'loaded');
    expect(tiles(c)[2]).toHaveAttribute('data-state', 'pending');
    expect(mosaic(c)).not.toHaveAttribute('data-settled'); // two still in flight

    fireEvent.load(imgs(c)[2]);
    fireEvent.load(imgs(c)[3]);
    expect(mosaic(c)).toHaveAttribute('data-settled', 'true');
    expect(tiles(c).every((t) => t.getAttribute('data-state') === 'loaded')).toBe(true);
  });

  it('is a decorative portrait: nothing interactive, no alt text competing with the page', () => {
    const c = renderMosaic(FOUR);
    expect(c.querySelector('a, button, [tabindex]')).toBeNull();
    for (const img of imgs(c)) expect(img).toHaveAttribute('alt', '');
  });
});

describe('per-tile failure: 2–3 posters resolve → the mosaic stays a mosaic', () => {
  it('a failed tile becomes a FallbackArt square (title initials), the rest stay posters', () => {
    const c = renderMosaic(FOUR);
    fireEvent.load(imgs(c)[0]);
    fireEvent.load(imgs(c)[1]);
    fireEvent.load(imgs(c)[2]);
    fireEvent.error(imgs(c)[3]); // Heat 404s

    expect(mosaic(c)).not.toBeNull(); // still a mosaic
    expect(mosaic(c)).toHaveAttribute('data-settled', 'true');
    expect(imgs(c)).toHaveLength(3);
    const fallback = c.querySelector('.known-for-mosaic__tile .fallback-art');
    expect(fallback).not.toBeNull();
    expect(fallback).toHaveTextContent('H'); // gradient + TITLE initials
    expect(tiles(c)[3]).toHaveAttribute('data-state', 'failed');
  });

  it('two failures out of four: still a mosaic (2 posters resolved)', () => {
    const c = renderMosaic(FOUR);
    fireEvent.error(imgs(c)[0]);
    fireEvent.error(imgs(c)[1]);
    fireEvent.load(imgs(c)[0]); // remaining two imgs after the first two swapped out
    fireEvent.load(imgs(c)[1]);

    expect(mosaic(c)).toHaveAttribute('data-settled', 'true');
    expect(imgs(c)).toHaveLength(2);
    expect(c.querySelectorAll('.known-for-mosaic__tile .fallback-art')).toHaveLength(2);
  });
});

describe('the floor: 0–1 posters resolve → the WHOLE slot is the Monogram', () => {
  it('one poster + three 404s collapses to the disc — no mosaic, no imgs, no fallback squares', () => {
    const c = renderMosaic(FOUR);
    fireEvent.load(imgs(c)[0]);
    fireEvent.error(imgs(c)[1]);
    fireEvent.error(imgs(c)[1]);
    fireEvent.error(imgs(c)[1]); // each error unmounts an img; index 1 is always "next"

    expect(mosaic(c)).toBeNull();
    expect(imgs(c)).toHaveLength(0);
    expect(c.querySelector('.fallback-art')).toBeNull();
    expect(monogram(c)).toHaveTextContent('AP');
  });

  it('all four 404 → the disc', () => {
    const c = renderMosaic(FOUR);
    for (let i = 0; i < 4; i += 1) fireEvent.error(imgs(c)[0]);
    expect(mosaic(c)).toBeNull();
    expect(monogram(c)).toHaveTextContent('AP');
  });
});

describe('reduced arrangements: fewer than 4 known-for titles keep the square filled', () => {
  it('3 titles → two tiles up top + one full-width tile below (never an empty hole)', () => {
    const c = renderMosaic(FOUR.slice(0, 3));
    expect(mosaic(c)).toHaveAttribute('data-count', '3');
    expect(imgs(c)).toHaveLength(3);
    expect(tiles(c)[2]).toHaveClass('known-for-mosaic__tile--span');
    expect(imgs(c)[2]).toHaveAttribute('width', '160'); // spans both columns
    imgs(c).forEach((img) => fireEvent.load(img));
    expect(mosaic(c)).toHaveAttribute('data-settled', 'true'); // 3 resolved → mosaic stays
  });

  it('2 titles → two side-by-side vertical halves', () => {
    const c = renderMosaic(FOUR.slice(0, 2));
    expect(mosaic(c)).toHaveAttribute('data-count', '2');
    expect(imgs(c)).toHaveLength(2);
    expect(imgs(c)[0]).toHaveAttribute('width', '79');
    expect(imgs(c)[0]).toHaveAttribute('height', '160');
    imgs(c).forEach((img) => fireEvent.load(img));
    expect(mosaic(c)).toHaveAttribute('data-settled', 'true');
  });

  it('2 titles where one 404s → 1 resolved → the whole slot collapses to the disc', () => {
    const c = renderMosaic(FOUR.slice(0, 2));
    fireEvent.load(imgs(c)[0]);
    fireEvent.error(imgs(c)[1]);
    expect(mosaic(c)).toBeNull();
    expect(monogram(c)).toHaveTextContent('AP');
  });
});

describe('0–1 title ids: the disc immediately, and NO request is ever issued', () => {
  it.each([
    ['one known-for title', [kf(1, 'Only One')]],
    ['empty knownForTitles', []],
    ['null knownForTitles', null],
    ['entries without tconst', [{ tconst: null, primaryTitle: 'No Id', rating: null }]],
  ])('%s → Monogram only, zero imgs', (_label, titles) => {
    const c = renderMosaic(titles);
    expect(monogram(c)).toHaveTextContent('AP');
    expect(imgs(c)).toHaveLength(0);
    expect(mosaic(c)).toBeNull();
  });
});

describe('budget and data hygiene', () => {
  it('never renders more than 4 tiles even if the data somehow carried more', () => {
    const c = renderMosaic([...FOUR, kf(5, 'Extra'), kf(6, 'More')]);
    expect(imgs(c)).toHaveLength(4);
  });

  it('deduplicates repeated tconsts (React key safety, no double request)', () => {
    const c = renderMosaic([FOUR[0], FOUR[0], FOUR[1]]);
    expect(imgs(c)).toHaveLength(2);
  });
});

describe('governance (grep-proved): the mosaic treatment depends on NO governed field', () => {
  it('KnownForMosaic reads neither numVotes nor any denial list', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'KnownForMosaic.jsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(source).not.toMatch(/numVotes/);
    expect(source).not.toMatch(/deniedFields|birthYear|deathYear/);
  });
});
