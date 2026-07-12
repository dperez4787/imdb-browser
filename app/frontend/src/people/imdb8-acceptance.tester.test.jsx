/**
 * IMDB-8 tester acceptance — only the gaps the developer's suite left, per
 * the tester's coverage read (PersonPage.test.jsx, personFormat.test.js,
 * personHooks.test.jsx already cover the rest and are not duplicated here):
 *
 *   1. Two cells of the DES-5 lifespan matrix untested at the DOM level:
 *      birth denied with death KNOWN (`▨▨🔒▨▨ – 2015`) and one-denied-
 *      beside-genuinely-absent — plus explicit assertions that the two
 *      families (denied vs missing) and the two pill variants (inline vs
 *      line-level) are structurally distinguishable in the DOM, which is
 *      DES-8's confusion rule stated as a test.
 *   2. The known-for strip under the GRANTED state: the developer proved
 *      dataset order with numVotes redacted; nothing proved a future grant
 *      (values present) doesn't re-rank the strip. Also a source-level pin
 *      that no rendering component in src/people/ reads `numVotes` at all.
 *   3. The 720px reflow AC. jsdom computes no layout, so — IMDB-7/IMDB-17
 *      precedent — the reflow is pinned at the stylesheet level: header
 *      stacks (single-column, centered), the strip scrolls horizontally
 *      inside its own box (overflow-x, max-width released), the rating
 *      column drops, and the grids use minmax(0, …) tracks so content
 *      shrinks instead of forcing a horizontal page scroll. Real-browser
 *      eyeballing stays deferred per the 2026-07-11 directive and is
 *      recorded as not-verified on the ticket, not as passed.
 *   4. Cross-navigation as actual navigation: the developer asserted hrefs;
 *      these tests CLICK — person page → title route, and a title page's
 *      PersonEntity chip → person route — so both directions of the AC are
 *      observed as route changes, not attribute spelling.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { PERSON_DETAIL_QUERY } from '../graphql/personQueries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import PersonEntity from '../title/PersonEntity.jsx';
import PersonPage from './PersonPage.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(srcDir, 'styles.css'), 'utf8');

const knownFor = (tconst, primaryTitle, startYear, rating = null) => ({
  tconst,
  primaryTitle,
  startYear,
  rating,
});

const person = (overrides = {}) => ({
  nconst: 'nm0000199',
  primaryName: 'Al Pacino',
  primaryProfessions: ['actor', 'director'],
  birthYear: null,
  deathYear: null,
  knownForTitles: [
    knownFor('tt0070666', 'Serpico', 1973, { averageRating: 7.7 }),
    knownFor('tt0072890', 'Dog Day Afternoon', 1975, { averageRating: 8 }),
    knownFor('tt0068646', 'The Godfather', 1972, { averageRating: 9.2 }),
    knownFor('tt0078718', 'And Justice for All', 1979, { averageRating: 7.4 }),
  ],
  credits: [
    {
      ordering: 1,
      category: 'actor',
      characters: ['Michael Corleone'],
      title: {
        tconst: 'tt0068646',
        primaryTitle: 'The Godfather',
        startYear: 1972,
        rating: { averageRating: 9.2 },
      },
    },
  ],
  ...overrides,
});

function stubPerson(name, deniedFields = []) {
  executeWithDenials.mockImplementation(async (document) => {
    if (document === PERSON_DETAIL_QUERY) return { data: { name }, deniedFields };
    throw new Error('unexpected document');
  });
}

function renderPersonRoute(extraRoutes = null) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/person/nm0000199']}>
        <Routes>
          <Route path="/person/:nconst" element={<PersonPage />} />
          {extraRoutes}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findHeadline = () => screen.findByRole('heading', { level: 1, name: 'Al Pacino' });
const lifespanLine = () => document.querySelector('.person-header__lifespan');

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
});

describe('IMDB-8 tester: the two untested lifespan matrix cells, at the DOM level', () => {
  it('birth denied, death known → inline pill in the birth slot, real 2015 beside it: ▨▨🔒▨▨ – 2015', async () => {
    stubPerson(person({ deathYear: 2015 }), ['Name.birthYear']);
    renderPersonRoute();
    await findHeadline();

    const line = lifespanLine();
    expect(line).not.toBeNull();
    const pill = line.querySelector('.restricted-value--inline');
    expect(pill).toHaveAttribute('data-coordinate', 'Name.birthYear');
    expect(within(line).getByText('2015')).toBeVisible();
    // The pill precedes the dash and the year — birth slot, not death slot.
    expect(line.textContent).toMatch(/–\s*2015$/);
    // Inline, never the line-level variant while a real year shows.
    expect(line.querySelector('.restricted-value--line')).toBeNull();
    expect(within(line).queryByText('Restricted')).toBeNull();
  });

  it('one slot denied while the other is genuinely absent → the line renders with ONE pill; the absent slot stays silent', async () => {
    stubPerson(person(), ['Name.deathYear']); // birthYear null and NOT denied
    renderPersonRoute();
    await findHeadline();

    const line = lifespanLine();
    expect(line).not.toBeNull(); // denied ⇒ the line always renders
    const pills = line.querySelectorAll('.restricted-value');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute('data-coordinate', 'Name.deathYear');
    expect(pills[0].className).toContain('restricted-value--inline');
    // The genuinely-absent birth slot renders nothing — no year, no pill.
    expect(line.querySelector('.person-header__year')).toBeNull();
  });

  it("CONFUSION RULE, pairwise: the four states' DOM signatures are mutually distinct", async () => {
    // Render each matrix state and capture a structural signature; DES-8's
    // rule is that no two of these can look alike.
    const signatureOf = async (personData, deniedFields) => {
      stubPerson(personData, deniedFields);
      const { unmount } = renderPersonRoute();
      await findHeadline();
      const line = lifespanLine();
      const signature = {
        line: line !== null,
        text: line?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        inlinePills: line
          ? [...line.querySelectorAll('.restricted-value--inline')].map((p) =>
              p.getAttribute('data-coordinate'),
            )
          : [],
        linePill: Boolean(line?.querySelector('.restricted-value--line')),
      };
      unmount();
      return signature;
    };

    const bothDenied = await signatureOf(person(), ['Name.birthYear', 'Name.deathYear']);
    const birthDenied = await signatureOf(person({ deathYear: 2015 }), ['Name.birthYear']);
    const deathDenied = await signatureOf(person({ birthYear: 1940 }), ['Name.deathYear']);
    const nothingDeniedAbsent = await signatureOf(person(), []);

    // Family 1 vs family 2: absence renders NO line; every denial renders one.
    expect(nothingDeniedAbsent.line).toBe(false);
    expect(bothDenied.line).toBe(true);
    expect(birthDenied.line).toBe(true);
    expect(deathDenied.line).toBe(true);

    // Both-denied is the line-level variant, the single-denied cells inline.
    expect(bothDenied.linePill).toBe(true);
    expect(bothDenied.inlinePills).toEqual([]);
    expect(birthDenied.linePill).toBe(false);
    expect(birthDenied.inlinePills).toEqual(['Name.birthYear']);
    expect(deathDenied.linePill).toBe(false);
    expect(deathDenied.inlinePills).toEqual(['Name.deathYear']);

    // And the two single-denied cells cannot be confused with each other:
    // the real year sits on opposite sides of the dash.
    expect(birthDenied.text).toMatch(/– 2015$/);
    expect(deathDenied.text).toMatch(/^1940 –/);
  });
});

describe('IMDB-8 tester: known-for strip has ZERO numVotes dependency — both governance states', () => {
  it('GRANTED numVotes (values present, nothing denied) still renders dataset order — never a vote re-rank', async () => {
    // Vote counts deliberately inverted against dataset order: a regression
    // to the retired top-4-by-numVotes ranking would flip the strip.
    stubPerson(
      person({
        knownForTitles: [
          knownFor('tt0070666', 'Serpico', 1973, { averageRating: 7.7, numVotes: 130_000 }),
          knownFor('tt0072890', 'Dog Day Afternoon', 1975, {
            averageRating: 8,
            numVotes: 270_000,
          }),
          knownFor('tt0068646', 'The Godfather', 1972, {
            averageRating: 9.2,
            numVotes: 2_100_000,
          }),
          knownFor('tt0078718', 'And Justice for All', 1979, {
            averageRating: 7.4,
            numVotes: 40_000,
          }),
        ],
      }),
      [], // nothing denied — the granted world
    );
    renderPersonRoute();
    await findHeadline();

    const titles = [...document.querySelectorAll('.known-for__strip .title-card__title')].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual([
      'Serpico',
      'Dog Day Afternoon',
      'The Godfather',
      'And Justice for All',
    ]);
    // And the granted values still never render on this page (DES-5: the
    // numVotes selection is DES-6 plumbing only).
    expect(document.body.textContent).not.toMatch(/votes/i);
    expect(document.body.textContent).not.toContain('2,100,000');
  });

  it('source pin: no rendering component under src/people/ references numVotes in code', () => {
    const stripComments = (source) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const file of [
      'people/KnownForStrip.jsx',
      'people/FilmographyRow.jsx',
      'people/FilmographyGroup.jsx',
      'people/PersonHeader.jsx',
      'people/PersonPage.jsx',
      'people/personFormat.js',
    ]) {
      expect(
        stripComments(readFileSync(join(srcDir, file), 'utf8')),
        `${file} must not read numVotes`,
      ).not.toContain('numVotes');
    }
  });
});

describe('IMDB-8 tester: DES-5 ≤720px reflow, pinned at the stylesheet level', () => {
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

  function personReflowBlock() {
    const block = narrowViewportBlocks(css).find((b) => b.includes('.person-header'));
    expect(block, 'a ≤720px media block covering .person-header exists').toBeDefined();
    return block;
  }

  const rulesFor = (block, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    expect(match, `${selector} has a rule in the ≤720px block`).not.toBeNull();
    return match[1];
  };

  it('header stacks: single-column person-header grid, centered items', () => {
    const header = rulesFor(personReflowBlock(), '.person-header');
    expect(header).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(header).toContain('justify-items: center');
  });

  it('known-for strip scrolls horizontally inside its own box — never the page', () => {
    const strip = rulesFor(personReflowBlock(), '.known-for__strip');
    expect(strip).toContain('overflow-x: auto');
    expect(strip).toContain('max-width: none');
    // Cards keep a fixed basis so the strip overflows its box, not the page.
    const card = rulesFor(personReflowBlock(), '.known-for__strip .title-card');
    expect(card).toMatch(/flex:\s*0 0/);
  });

  it('filmography rows drop the rating column', () => {
    const block = personReflowBlock();
    expect(rulesFor(block, '.filmography-row__rating')).toContain('display: none');
    // The row grid loses its 5th (rating) track in the same block.
    const row = rulesFor(block, '.filmography-row__link');
    expect(row).toContain('grid-template-columns: 32px minmax(0, 2fr) 3.2rem minmax(0, 2fr)');
    expect(row).not.toContain('3.5rem');
  });

  it('no horizontal page scroll: base grids use minmax(0, …) tracks at every width', () => {
    const header = css.match(/\.person-header\s*\{([^}]*)\}/)[1];
    expect(header).toContain('grid-template-columns: 160px minmax(0, 1fr)');
    const strip = css.match(/\.known-for__strip\s*\{([^}]*)\}/)[1];
    expect(strip).toContain('repeat(4, minmax(0, 1fr))');
    const row = css.match(/\.filmography-row__link\s*\{([^}]*)\}/)[1];
    expect(row).toContain('grid-template-columns: 32px minmax(0, 2fr) 3.2rem minmax(0, 2fr) 3.5rem');
  });
});

describe('IMDB-8 tester: cross-navigation as observed route changes, both directions', () => {
  it('clicking a filmography row on the person page NAVIGATES to the title route', async () => {
    stubPerson(person(), ['Name.birthYear', 'Name.deathYear']);
    renderPersonRoute(<Route path="/title/:tconst" element={<div>title page stub</div>} />);
    await findHeadline();

    fireEvent.click(screen.getByText('The Godfather', { selector: '.filmography-row__title' }));
    expect(await screen.findByText('title page stub')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1, name: 'Al Pacino' })).toBeNull();
  });

  it("clicking a title page's PersonEntity chip NAVIGATES to the person route", async () => {
    stubPerson(person(), []);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/title/tt0068646']}>
          <Routes>
            <Route
              path="/title/:tconst"
              element={
                <PersonEntity
                  person={{ nconst: 'nm0000199', primaryName: 'Al Pacino' }}
                  characters={['Michael Corleone']}
                />
              }
            />
            <Route path="/person/:nconst" element={<PersonPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Al Pacino'));
    // The REAL person page mounts and hydrates for the chip's nconst.
    expect(await findHeadline()).toBeVisible();
    expect(executeWithDenials).toHaveBeenCalledWith(
      PERSON_DETAIL_QUERY,
      expect.objectContaining({ nconst: 'nm0000199' }),
    );
  });
});
