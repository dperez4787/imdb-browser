/**
 * RatingBlock (IMDB-7): the amended AC's three-way governed votes slot, and
 * the confusion rule it exists for — "no rating data" (block gone) must
 * never look like "vote count restricted" (block present, votes line
 * redacted), and a merely-missing numVotes must never masquerade as a
 * redaction (DES-8 rule 2).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RatingBlock, { NUM_VOTES_COORDINATE } from './RatingBlock.jsx';

const pill = (container) =>
  container.querySelector(`.restricted-value[data-coordinate="${NUM_VOTES_COORDINATE}"]`);

describe('RatingBlock — three-way votes slot', () => {
  it('state 1 (granted): stars + compact vote count, no pill', () => {
    const { container } = render(
      <RatingBlock rating={{ averageRating: 9.2, numVotes: 2132880 }} deniedFields={[]} />,
    );
    expect(screen.getByText('9.2')).toBeInTheDocument();
    expect(screen.getByText('2.1M votes')).toBeInTheDocument();
    expect(pill(container)).toBeNull();
  });

  it('state 2 (denied): stars intact, the votes line holds the RestrictedValue pill', () => {
    const { container } = render(
      <RatingBlock rating={{ averageRating: 9.2 }} deniedFields={[NUM_VOTES_COORDINATE]} />,
    );
    expect(screen.getByText('9.2')).toBeInTheDocument();
    expect(pill(container)).not.toBeNull();
    // The pill sits in the votes line's exact box (zero layout jump rule).
    expect(pill(container).closest('.rating-block__votes')).not.toBeNull();
    // The redaction announces itself to screen readers via DES-8's copy.
    expect(screen.getByText('Vote count: restricted by data governance.')).toBeInTheDocument();
    expect(screen.queryByText(/votes$/)).toBeNull();
  });

  it('state 3 (no rating, nothing denied): the whole block is absent', () => {
    const { container } = render(<RatingBlock rating={null} deniedFields={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('CONFUSION RULE: numVotes merely null and NOT denied → silent absence, never the pill', () => {
    const { container } = render(
      <RatingBlock rating={{ averageRating: 7.4, numVotes: null }} deniedFields={[]} />,
    );
    expect(screen.getByText('7.4')).toBeInTheDocument();
    expect(pill(container)).toBeNull();
    expect(container.querySelector('.rating-block__votes')).toBeNull();
  });

  it('CONFUSION RULE, other direction: denied coordinate but no rating at all → block absent (a pill without stars would assert a rating exists)', () => {
    // redactedFields is document-scoped, so an unrated title can still
    // report Rating.numVotes denied — absence wins, exactly like state 3.
    const { container } = render(
      <RatingBlock rating={null} deniedFields={[NUM_VOTES_COORDINATE]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('granted value wins over a stale denial list (value present → show it)', () => {
    // Defensive: if data carries the value, the slot shows the value — the
    // pill renders only when the value is actually absent.
    const { container } = render(
      <RatingBlock
        rating={{ averageRating: 9.2, numVotes: 100 }}
        deniedFields={[NUM_VOTES_COORDINATE]}
      />,
    );
    expect(screen.getByText('100 votes')).toBeInTheDocument();
    expect(pill(container)).toBeNull();
  });

  it('one decimal always: 9 → 9.0 (a rating, not a count)', () => {
    render(<RatingBlock rating={{ averageRating: 9, numVotes: 10 }} deniedFields={[]} />);
    expect(screen.getByText('9.0')).toBeInTheDocument();
  });
});
