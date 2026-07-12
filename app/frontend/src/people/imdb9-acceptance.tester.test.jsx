/**
 * IMDB-9 tester acceptance — only the gaps the developer's suite left, per
 * the tester's coverage read (KnownForMosaic.test.jsx, PersonVisual.test.jsx,
 * knownForPoster.test.js, PersonPage.test.jsx already cover the ladder
 * counts, budgets, dedupe, the denied/granted pick, and the source-level
 * governance grep — none of that is duplicated here):
 *
 *   1. The NO-FALLBACK-FLASH rule is enforced by the stylesheet (a failed
 *      tile's FallbackArt sits in the DOM at opacity 0 until the mosaic
 *      settles), and the developer's tests assert only the data attributes,
 *      never the visibility they drive. jsdom computes attribute-selector
 *      cascade for opacity, so these tests inject the REAL styles.css and
 *      read getComputedStyle mid-flight: a failed tile stays invisible while
 *      any tile is pending, loaded tiles fade in immediately, and a doomed
 *      mosaic (every tile 404s) never shows a FallbackArt square at any
 *      point on its way down to the Monogram floor.
 *   2. The zero-request floor at the REAL consumer: PersonHeader with one
 *      known-for title renders the Monogram disc in the aria-hidden 160px
 *      slot with zero <img> — the ≤4 budget's other edge, asserted where
 *      DES-6 tier 2 actually ships rather than on the bare component.
 *   3. The autocomplete 0-request budget, structurally: the omnibox's
 *      UNIVERSAL_SEARCH_QUERY selects NO knownForTitles for Name hits, so
 *      person rows cannot construct a poster URL even by mistake. (The
 *      DOM-level "person rows contain no <img>" assertions live in
 *      search/SearchHitRow.test.jsx and imdb5-acceptance.tester.test.jsx and
 *      still pass unchanged — DES-6 tier 1 is explicitly IMDB-5's contract.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UNIVERSAL_SEARCH_QUERY } from '../graphql/searchQueries.js';
import KnownForMosaic from './KnownForMosaic.jsx';
import PersonHeader from './PersonHeader.jsx';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(srcDir, 'styles.css'), 'utf8');

const kf = (n, primaryTitle) => ({
  tconst: `tt000000${n}`,
  primaryTitle,
  startYear: 1970 + n,
  rating: { averageRating: 7 + n / 10 }, // live denied shape: numVotes absent
});

const FOUR = [kf(1, 'Serpico'), kf(2, 'Dog Day Afternoon'), kf(3, 'The Godfather'), kf(4, 'Heat')];

const pacino = (knownForTitles) => ({
  nconst: 'nm0000199',
  primaryName: 'Al Pacino',
  primaryProfessions: ['actor'],
  birthYear: null,
  deathYear: null,
  knownForTitles,
});

describe('no-fallback-flash: the stylesheet gate the data attributes drive (DES-6 ladder)', () => {
  let styleEl;

  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
  });

  const tiles = (c) => [...c.querySelectorAll('.known-for-mosaic__tile')];
  const imgs = (c) => [...c.querySelectorAll('img.poster-image')];
  const opacity = (el) => getComputedStyle(el).opacity;

  it('a failed tile is INVISIBLE while any tile is still pending, and revealed only once all settle', () => {
    const { container: c } = render(<KnownForMosaic person={pacino(FOUR)} size={160} />);

    // Heat 404s first: its FallbackArt swap happens in the DOM immediately…
    fireEvent.error(imgs(c)[3]);
    expect(tiles(c)[3].querySelector('.fallback-art')).not.toBeNull();
    // …but the stylesheet keeps the tile at opacity 0 — no fallback flash
    // while the other three are still in flight.
    expect(opacity(tiles(c)[3])).toBe('0');

    // Loaded tiles fade in immediately (DES-6: "tiles fade in as they load").
    fireEvent.load(imgs(c)[0]);
    expect(opacity(tiles(c)[0])).toBe('1');
    expect(opacity(tiles(c)[3])).toBe('0'); // still gated

    // The last two resolve → settled → NOW the FallbackArt square shows.
    fireEvent.load(imgs(c)[1]);
    fireEvent.load(imgs(c)[2]);
    expect(c.querySelector('.known-for-mosaic')).toHaveAttribute('data-settled', 'true');
    expect(opacity(tiles(c)[3])).toBe('1');
  });

  it('a doomed mosaic never shows a FallbackArt square at ANY point before collapsing to the disc', () => {
    const { container: c } = render(<KnownForMosaic person={pacino(FOUR.slice(0, 2))} size={160} />);

    // First of two 404s while the second is pending: fallback present in the
    // DOM but invisible, the Monogram floor still what the user sees.
    fireEvent.error(imgs(c)[0]);
    const failedTile = tiles(c).find((t) => t.getAttribute('data-state') === 'failed');
    expect(opacity(failedTile)).toBe('0');
    expect(c.querySelector('.known-for-mosaic__floor .monogram')).toHaveTextContent('AP');

    // Second 404 → 0 resolved → the WHOLE slot is the disc; no fallback art
    // ever reached opacity 1 because settling and collapsing are the same
    // render.
    fireEvent.error(imgs(c)[0]);
    expect(c.querySelector('.known-for-mosaic')).toBeNull();
    expect(c.querySelector('.fallback-art')).toBeNull();
    expect(c.querySelector('.monogram')).toHaveTextContent('AP');
  });
});

describe('the zero-request floor at the real consumer (PersonHeader, DES-6 tier 2)', () => {
  it('one known-for title → the aria-hidden 160px slot holds the Monogram and issues ZERO image requests', () => {
    const { container: c } = render(
      <PersonHeader person={pacino([kf(1, 'Serpico')])} deniedFields={[]} />,
    );
    const slot = c.querySelector('.person-header__visual');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot.querySelector('.monogram')).toHaveTextContent('AP');
    expect(slot.querySelectorAll('img')).toHaveLength(0); // a 1-tile mosaic would be wasted OMDb spend
    expect(slot.querySelector('.known-for-mosaic')).toBeNull();
  });
});

describe('autocomplete budget = 0, structurally (DES-6 tier 1 unchanged)', () => {
  it('UNIVERSAL_SEARCH_QUERY selects no knownForTitles for Name hits — person rows have no title id to spend', () => {
    const nameFragment = UNIVERSAL_SEARCH_QUERY.match(/\.\.\. on Name \{[^}]*\}/)?.[0];
    expect(nameFragment).toBeTruthy();
    expect(nameFragment).not.toContain('knownForTitles');
  });
});
