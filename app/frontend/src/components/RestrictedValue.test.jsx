/**
 * RestrictedValue tests (IMDB-14 AC: "renders exactly as its approved design
 * spec defines, visually distinct from the absent-data state, exported for
 * reuse") — behaviors from designs/DES-8-restricted-field-treatment.md:
 * variants, tooltip on hover AND keyboard focus with the spec copy, Esc
 * dismissal with focus retained, visually-hidden SR text, aria-hidden
 * decoration, static (no animation), and the isRestricted predicate.
 *
 * Interactions use fireEvent + real DOM focus (userEvent is not a project
 * dependency): mouseOver/mouseOut drive React's onMouseEnter/onMouseLeave,
 * element.focus()/blur() drive real focus in jsdom.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RestrictedValue, { isRestricted } from './RestrictedValue.jsx';

const pillOf = (container) => container.querySelector('.restricted-value');
const tooltipOf = (container) => container.querySelector('.restricted-value__tooltip');

describe('isRestricted (the two-rule contract predicate)', () => {
  it('is true iff the coordinate is in deniedFields', () => {
    expect(isRestricted(['Rating.numVotes'], 'Rating.numVotes')).toBe(true);
    expect(isRestricted(['Name.birthYear', 'Name.deathYear'], 'Name.deathYear')).toBe(true);
    expect(isRestricted(['Name.birthYear'], 'Rating.numVotes')).toBe(false);
    expect(isRestricted([], 'Rating.numVotes')).toBe(false);
  });

  it('never guesses on missing input: undefined/null deniedFields → false (rule 2: absent ≠ restricted)', () => {
    expect(isRestricted(undefined, 'Rating.numVotes')).toBe(false);
    expect(isRestricted(null, 'Rating.numVotes')).toBe(false);
  });
});

describe('rendering', () => {
  it('renders the inline variant by default with the coordinate as a data attribute (never visible text)', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const el = pillOf(container);
    expect(el).toHaveClass('restricted-value--inline');
    expect(el).toHaveAttribute('data-coordinate', 'Rating.numVotes');
    // The coordinate string is for tests/tooling, not for humans.
    expect(screen.queryByText(/Rating\.numVotes/)).not.toBeInTheDocument();
  });

  it('sizes the inline pill from the width hint (default 3.5em)', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    expect(container.querySelector('.restricted-value__pill')).toHaveStyle({ width: '3.5em' });

    const year = render(
      <RestrictedValue coordinate="Name.birthYear" label="Birth year" width="2.5em" />,
    );
    expect(year.container.querySelector('.restricted-value__pill')).toHaveStyle({
      width: '2.5em',
    });
  });

  it('line variant adds the small-caps RESTRICTED word; inline does not', () => {
    const { container } = render(
      <RestrictedValue coordinate="Name.birthYear" label="Lifespan" variant="line" />,
    );
    expect(pillOf(container)).toHaveClass('restricted-value--line');
    const word = container.querySelector('.restricted-value__word');
    expect(word).toHaveTextContent('Restricted');
    expect(word).toHaveAttribute('aria-hidden', 'true');

    const inline = render(<RestrictedValue coordinate="Rating.numVotes" label="Vote count" />);
    expect(inline.container.querySelector('.restricted-value__word')).toBeNull();
  });

  it('shows the lock glyph as aria-hidden decoration inside the hatched pill', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const pill = container.querySelector('.restricted-value__pill');
    expect(pill).toHaveAttribute('aria-hidden', 'true');
    expect(pill.querySelector('svg.restricted-value__lock')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('is static: no animation anywhere (the discriminator against shimmering skeletons)', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.style?.animation || '').toBe('');
      expect(String(el.className)).not.toMatch(/skeleton|shimmer|pulse/i);
    }
  });
});

describe('screen-reader text', () => {
  it('carries the visually-hidden "<Label>: restricted by data governance." as accessible content', () => {
    render(<RestrictedValue coordinate="Rating.numVotes" label="Vote count" />);
    const sr = screen.getByText('Vote count: restricted by data governance.');
    expect(sr).toHaveClass('restricted-value__sr');
    expect(sr).not.toHaveAttribute('aria-hidden');
  });
});

describe('tooltip (the explaining affordance — hover AND keyboard focus)', () => {
  const TOOLTIP_BODY =
    'Vote count is governed data this app hasn’t been granted. If access is granted, it appears here automatically.';

  it('is closed by default and never opens on its own', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    expect(tooltipOf(container)).toBeNull();
  });

  it('opens on hover with the spec copy, closes on unhover', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    fireEvent.mouseOver(pillOf(container));
    const tooltip = tooltipOf(container);
    expect(tooltip).toHaveTextContent('Restricted');
    expect(tooltip).toHaveTextContent(TOOLTIP_BODY);
    // Presentation only: SR users get the hidden text, not a double read.
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');

    fireEvent.mouseOut(pillOf(container));
    expect(tooltipOf(container)).toBeNull();
  });

  it('is focusable (tabIndex=0, not a button) and opens the tooltip on keyboard focus', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const el = pillOf(container);
    expect(el).toHaveAttribute('tabindex', '0');
    expect(el.tagName).not.toBe('BUTTON');

    act(() => el.focus());
    expect(el).toHaveFocus();
    expect(tooltipOf(container)).not.toBeNull();
  });

  it('Esc dismisses the tooltip while focus stays on the pill; blur closes it too', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const el = pillOf(container);

    act(() => el.focus());
    expect(tooltipOf(container)).not.toBeNull();

    fireEvent.keyDown(el, { key: 'Escape' });
    expect(tooltipOf(container)).toBeNull();
    expect(el).toHaveFocus(); // Esc never throws focus away

    act(() => el.focus());
    act(() => el.blur()); // moving on must not leave a stray tooltip behind
    expect(tooltipOf(container)).toBeNull();
  });

  it('Enter/Space do nothing — it is not a button and never navigates', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const el = pillOf(container);
    act(() => el.focus());
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    // Still just the focused pill with its tooltip — no state change, no crash.
    expect(el).toHaveFocus();
    expect(tooltipOf(container)).not.toBeNull();
  });
});
