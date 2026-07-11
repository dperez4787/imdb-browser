/**
 * IMDB-7 tester acceptance — the two gaps the developer's suite left, per
 * the tester's coverage read (everything else the amended ACs name is
 * already exercised in TitlePage.test.jsx / RatingBlock.test.jsx /
 * format.test.js and was not duplicated here):
 *
 *   1. Genre-chip href ENCODING. The chips' /titles?genres=X links were
 *      asserted only for plain genre words; nothing pinned that the genre
 *      value is percent-encoded into the query string, so a regression to
 *      naive string concat would have passed the existing tests.
 *   2. The 720px reflow AC. jsdom computes no layout, so — following the
 *      IMDB-17 precedent — the reflow is pinned at the stylesheet level:
 *      the ≤720px media block must center the poster above the header
 *      (single-column .title-header grid) and stack credit groups
 *      full-width (single-column .credit-group__list), and both grids must
 *      use minmax(0, …) tracks so content can shrink instead of forcing a
 *      horizontal page scroll. Real-browser reflow eyeballing stays
 *      deferred per the 2026-07-11 directive and is recorded as
 *      not-verified on the ticket, not as passed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import GenreChips, { genreHref } from './GenreChips.jsx';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'),
  'utf8',
);

/** Every `@media (max-width: 720px)` block in the sheet, brace-balanced. */
function narrowViewportBlocks(source) {
  const marker = '@media (max-width: 720px)';
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return blocks;
    const open = source.indexOf('{', at);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < source.length) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push(source.slice(open + 1, i - 1));
    from = i;
  }
}

/** The one narrow-viewport block that owns the title page's reflow. */
function titleReflowBlock() {
  const block = narrowViewportBlocks(css).find((b) => b.includes('.title-header'));
  expect(block, 'a ≤720px media block covering .title-header exists').toBeDefined();
  return block;
}

const rulesFor = (block, selector) => {
  const match = block.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} has a rule in the ≤720px block`).not.toBeNull();
  return match[1];
};

describe('IMDB-7 tester: genre chip hrefs percent-encode the genre value', () => {
  it('genreHref encodes reserved characters, so /titles receives exactly one genre', () => {
    // No current IMDb genre needs encoding ('Sci-Fi', 'Film-Noir' pass
    // through unchanged) — this pins the seam so a future value with a
    // space or & cannot split the query string or smuggle a second param.
    expect(genreHref('Crime')).toBe('/titles?genres=Crime');
    expect(genreHref('Sci-Fi')).toBe('/titles?genres=Sci-Fi');
    expect(genreHref('Film Noir & Jazz')).toBe('/titles?genres=Film%20Noir%20%26%20Jazz');
    expect(genreHref('Docu?series=x')).toBe('/titles?genres=Docu%3Fseries%3Dx');
  });

  it('the rendered anchors carry the encoded href', () => {
    render(
      <MemoryRouter>
        <GenreChips genres={['Sci-Fi', 'Film Noir & Jazz']} />
      </MemoryRouter>,
    );
    const chips = within(screen.getByRole('list', { name: 'Genres' })).getAllByRole('link');
    expect(chips.map((a) => a.getAttribute('href'))).toEqual([
      '/titles?genres=Sci-Fi',
      '/titles?genres=Film%20Noir%20%26%20Jazz',
    ]);
    // The visible label stays the data's own words, unencoded.
    expect(chips.map((a) => a.textContent)).toEqual(['Sci-Fi', 'Film Noir & Jazz']);
  });
});

describe('IMDB-7 tester: DES-4 ≤720px reflow, pinned at the stylesheet level', () => {
  it('poster centers above the header: single-column title-header grid, centered items', () => {
    const block = titleReflowBlock();
    const header = rulesFor(block, '.title-header');
    expect(header).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(header).toContain('justify-items: center');
  });

  it('credit groups stack full-width: single-column list inside the media block', () => {
    const list = rulesFor(titleReflowBlock(), '.credit-group__list');
    expect(list).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('no horizontal page scroll: both grids use minmax(0, …) tracks at every width', () => {
    // A bare 1fr track cannot shrink below its content's min-content width —
    // minmax(0, …) is what lets long names wrap instead of widening the page.
    const base = css.match(/\.title-header\s*\{([^}]*)\}/)[1];
    expect(base).toContain('grid-template-columns: 260px minmax(0, 1fr)');
    const list = css.match(/\.credit-group__list\s*\{([^}]*)\}/)[1];
    expect(list).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
  });
});
