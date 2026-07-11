/**
 * SearchFreshness (IMDB-13, folded into IMDB-5 per DES-2): relative wording,
 * the null (index-never-built) state, and the absence rule — no searchInfo,
 * no footer, never a guess.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SearchFreshness, { formatRebuilt } from './SearchFreshness.jsx';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

describe('formatRebuilt', () => {
  it('says "just now" under 60 seconds', () => {
    expect(formatRebuilt(ago(30_000), NOW)).toBe('just now');
  });

  it('uses minutes under an hour', () => {
    expect(formatRebuilt(ago(45 * 60_000), NOW)).toBe('45 min ago');
  });

  it('uses hours under 24h', () => {
    expect(formatRebuilt(ago(3 * 60 * 60_000), NOW)).toBe('3 h ago');
  });

  it('uses "Mon D" beyond 24h', () => {
    expect(formatRebuilt('2026-07-03T08:00:00.000Z', NOW)).toBe('Jul 3');
  });
});

describe('SearchFreshness', () => {
  it('renders nothing at all when searchInfo is unavailable (absence, never a guess)', () => {
    const { container: none } = render(<SearchFreshness searchInfo={undefined} />);
    expect(none).toBeEmptyDOMElement();
    const { container: nulled } = render(<SearchFreshness searchInfo={null} />);
    expect(nulled).toBeEmptyDOMElement();
  });

  it('renders "Index not yet built" when rebuiltAt is null (never-built index)', () => {
    render(<SearchFreshness searchInfo={{ rebuiltAt: null }} />);
    expect(screen.getByText('Index not yet built')).toBeInTheDocument();
  });

  it('renders the relative line with the absolute timestamp on the info mark', () => {
    const rebuiltAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    render(<SearchFreshness searchInfo={{ rebuiltAt }} />);
    expect(screen.getByText('Index rebuilt 3 h ago')).toBeInTheDocument();
    expect(screen.getByText('ⓘ')).toHaveAttribute('title', rebuiltAt);
  });
});
