/**
 * PersonVisual + PersonPosterBadge (IMDB-9, DES-6): the treatment switch and
 * the card variant's depth-1 ladder.
 *
 *   - `monogram` (default): the autocomplete-tier contract — ZERO image
 *     requests, ever (DES-6 tier 1 is explicitly unchanged; the omnibox rows
 *     themselves are covered in search/SearchHitRow.test.jsx and
 *     search/imdb5-acceptance.tester.test.jsx, which assert person rows
 *     never contain an <img>).
 *   - `mosaic`: delegates to KnownForMosaic (ladder tested in its own suite).
 *   - `poster+badge`: ≤1 lazy request, denial-safe first-entry pick with the
 *     opportunistic numVotes upgrade, monogram badge, plain-Monogram floor on
 *     404 — never FallbackArt (a title-initials square would misidentify the
 *     person).
 */
import { fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { posterUrl } from '../PosterImage.jsx';
import PersonVisual from './PersonVisual.jsx';

const kf = (tconst, primaryTitle, numVotes) => ({
  tconst,
  primaryTitle,
  rating:
    numVotes === undefined
      ? { averageRating: 8 } // live denied shape: numVotes stripped, sibling intact
      : { averageRating: 8, numVotes },
});

const pacino = (knownForTitles) => ({
  nconst: 'nm0000199',
  primaryName: 'Al Pacino',
  knownForTitles,
});

const DENIED_SET = [kf('tt0070666', 'Serpico'), kf('tt0068646', 'The Godfather')];
const GRANTED_SET = [kf('tt0070666', 'Serpico', 130_000), kf('tt0068646', 'The Godfather', 2_100_000)];

describe('treatment switch', () => {
  it('monogram (the default): the disc alone — zero image requests', () => {
    const { container } = render(<PersonVisual person={pacino(DENIED_SET)} size={40} />);
    expect(container.querySelector('.monogram')).toHaveTextContent('AP');
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('.known-for-mosaic')).toBeNull();
    expect(container.querySelector('.person-poster-badge')).toBeNull();
  });

  it('mosaic: delegates to KnownForMosaic at the caller’s size', () => {
    const { container } = render(
      <PersonVisual person={pacino(DENIED_SET)} treatment="mosaic" size={160} />,
    );
    const mosaic = container.querySelector('.known-for-mosaic');
    expect(mosaic).not.toBeNull();
    expect(mosaic.style.width).toBe('160px');
  });
});

describe('poster+badge — the card variant, depth-1 ladder', () => {
  it('renders exactly ONE lazy OMDb request: the FIRST known-for entry while numVotes is denied', () => {
    const { container } = render(
      <PersonVisual person={pacino(DENIED_SET)} treatment="poster+badge" size={40} />,
    );
    const imgs = container.querySelectorAll('img.poster-image');
    expect(imgs).toHaveLength(1); // the ≤1-per-card budget is structural
    expect(imgs[0].src).toBe(posterUrl('tt0070666')); // dataset order, ungoverned
    expect(imgs[0]).toHaveAttribute('loading', 'lazy');
  });

  it('opportunistically upgrades the pick when the SAME data carries granted numVotes — still one request', () => {
    const { container } = render(
      <PersonVisual person={pacino(GRANTED_SET)} treatment="poster+badge" size={40} />,
    );
    const imgs = container.querySelectorAll('img.poster-image');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe(posterUrl('tt0068646')); // client-side max-voted
    // No restricted treatment in either direction — the pick is a heuristic,
    // never a displayed fact (DES-8 "where it deliberately doesn't apply").
    expect(container.querySelector('.restricted-value')).toBeNull();
  });

  it('shows the plain Monogram floor while pending, then poster + 16px monogram badge once loaded', () => {
    const { container } = render(
      <PersonVisual person={pacino(DENIED_SET)} treatment="poster+badge" size={40} />,
    );
    const badge = container.querySelector('.person-poster-badge');
    expect(badge).toHaveAttribute('data-state', 'pending');
    expect(container.querySelector('.person-poster-badge__floor .monogram')).toHaveTextContent('AP');

    fireEvent.load(container.querySelector('img.poster-image'));
    expect(badge).toHaveAttribute('data-state', 'loaded');
    const badgeDisc = container.querySelector('.person-poster-badge__badge .monogram');
    expect(badgeDisc).toHaveTextContent('AP');
    expect(badgeDisc.style.width).toBe('16px');
  });

  it('404 → plain Monogram: no broken image, and NEVER a title-initials FallbackArt on a person card', () => {
    const { container } = render(
      <PersonVisual person={pacino(DENIED_SET)} treatment="poster+badge" size={40} />,
    );
    fireEvent.error(container.querySelector('img.poster-image'));
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('.fallback-art')).toBeNull();
    expect(container.querySelector('.person-poster-badge')).toBeNull();
    expect(container.querySelector('.monogram')).toHaveTextContent('AP');
  });

  it.each([
    ['no knownForTitles at all', null],
    ['empty knownForTitles', []],
  ])('%s → plain Monogram, zero requests', (_label, titles) => {
    const { container } = render(
      <PersonVisual person={pacino(titles)} treatment="poster+badge" size={40} />,
    );
    expect(container.querySelector('.monogram')).toHaveTextContent('AP');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('governance (grep-proved): no treatment DEPENDS on a governed field', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the visual components read neither numVotes nor any denial list', () => {
    for (const file of ['PersonVisual.jsx', 'PersonPosterBadge.jsx', 'KnownForMosaic.jsx']) {
      const source = strip(readFileSync(join(here, file), 'utf8'));
      expect(source, `${file} must not read numVotes`).not.toMatch(/numVotes/);
      expect(source, `${file} must not consult denial state`).not.toMatch(/deniedFields/);
    }
  });

  it('the pick touches numVotes ONLY behind a value-presence guard (opportunistic, never required)', () => {
    const source = strip(readFileSync(join(here, 'knownForPoster.js'), 'utf8'));
    // The single gate on the governed field: entries are considered voted
    // only when a value is PRESENT in the fetched data.
    expect(source).toMatch(/rating\?\.numVotes != null/);
    expect(source).not.toMatch(/deniedFields/);
  });
});
