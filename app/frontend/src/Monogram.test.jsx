import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Monogram, { hueFromString, initialsFrom } from './Monogram.jsx';

describe('Monogram', () => {
  it('derives up to two initials', () => {
    expect(initialsFrom('Danny Perez')).toBe('DP');
    expect(initialsFrom('Cher')).toBe('C');
    expect(initialsFrom('Ana de la Reguera')).toBe('AD');
    expect(initialsFrom('')).toBe('?');
    expect(initialsFrom(null)).toBe('?');
  });

  it('derives a deterministic hue: same seed, same hue; in range', () => {
    const first = hueFromString('nm0000199');
    expect(hueFromString('nm0000199')).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(360);
  });

  it('renders the initials in a fixed-size disc (no layout shift vs a 32px avatar)', () => {
    const { container } = render(<Monogram text="Danny Perez" seed="u1" size={32} />);
    const disc = container.querySelector('.monogram');
    expect(disc).toHaveTextContent('DP');
    expect(disc.style.width).toBe('32px');
    expect(disc.style.height).toBe('32px');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
  });
});
