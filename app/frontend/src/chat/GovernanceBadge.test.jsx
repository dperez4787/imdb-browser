/**
 * GovernanceBadge (DES-7 addendum / IMDB-16): the streamed restricted-fields
 * footer. Verifies the recipe — swatch + coordinates in first-seen order with
 * overflow, the full set in data-coordinates and the accessible text, the
 * hover/focus tooltip with the governance guarantee copy, and — critically —
 * ZERO DOM when there is no governance.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import GovernanceBadge from './GovernanceBadge.jsx';

const badgeIn = (container) => container.querySelector('.chat-governance');

describe('zero-cost default (no governance)', () => {
  it('renders NOTHING for an empty list', () => {
    const { container } = render(<GovernanceBadge redactedFields={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders NOTHING for an absent / non-array prop', () => {
    const { container: a } = render(<GovernanceBadge redactedFields={undefined} />);
    expect(a.firstChild).toBeNull();
    const { container: b } = render(<GovernanceBadge redactedFields={null} />);
    expect(b.firstChild).toBeNull();
  });
});

describe('the restricted-fields line', () => {
  it('shows the label, the coordinate, and emits data-coordinates for tests', () => {
    const { container } = render(<GovernanceBadge redactedFields={['Rating.numVotes']} />);
    const badge = badgeIn(container);
    expect(badge).toHaveAttribute('data-coordinates', 'Rating.numVotes');
    expect(badge).toHaveTextContent('Restricted for your role:');
    expect(badge.querySelector('.chat-governance__coord')).toHaveTextContent('Rating.numVotes');
    // Not a button — it never navigates; a focusable div per DES-8.
    expect(badge.tagName).toBe('DIV');
    expect(badge).toHaveAttribute('tabindex', '0');
  });

  it('shows at most three coordinates, then "+N more"; the full set stays in data-coordinates and SR text', () => {
    const fields = [
      'Rating.numVotes',
      'Name.birthYear',
      'Name.deathYear',
      'Title.budget',
      'Title.gross',
    ];
    const { container } = render(<GovernanceBadge redactedFields={fields} />);
    const badge = badgeIn(container);

    expect(badge.querySelectorAll('.chat-governance__coord')).toHaveLength(3);
    expect(badge.querySelector('.chat-governance__more')).toHaveTextContent('+2 more');
    // The full set is always recoverable — data attr for tests, SR text for AT.
    expect(badge).toHaveAttribute('data-coordinates', fields.join(','));
    expect(badge).toHaveTextContent(`Restricted for your role: ${fields.join(', ')}.`);
  });
});

describe('tooltip (hover and keyboard focus, Esc dismisses)', () => {
  const copy = /it sees exactly what you see/i;

  it('is closed until hover, opens on hover, closes on mouse leave', () => {
    const { container } = render(<GovernanceBadge redactedFields={['Rating.numVotes']} />);
    const badge = badgeIn(container);
    expect(screen.queryByText(copy)).toBeNull();

    fireEvent.mouseEnter(badge);
    expect(screen.getByText(copy)).toBeInTheDocument();

    fireEvent.mouseLeave(badge);
    expect(screen.queryByText(copy)).toBeNull();
  });

  it('opens on keyboard focus and Esc dismisses it', () => {
    const { container } = render(<GovernanceBadge redactedFields={['Rating.numVotes']} />);
    const badge = badgeIn(container);

    fireEvent.focus(badge);
    expect(screen.getByText(copy)).toBeInTheDocument();

    fireEvent.keyDown(badge, { key: 'Escape' });
    expect(screen.queryByText(copy)).toBeNull();
  });

  it('lists the FULL coordinate set in the tooltip even when the line overflowed', () => {
    const fields = ['Rating.numVotes', 'Name.birthYear', 'Name.deathYear', 'Title.budget'];
    const { container } = render(<GovernanceBadge redactedFields={fields} />);
    fireEvent.mouseEnter(badgeIn(container));
    const tip = container.querySelector('.chat-governance__tooltip');
    for (const f of fields) expect(tip).toHaveTextContent(f);
  });
});
