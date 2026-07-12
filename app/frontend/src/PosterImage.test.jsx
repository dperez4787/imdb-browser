/**
 * PosterImage / FallbackArt (DES-1 shared units, first consumer DES-2):
 * OMDb URL construction (sanctioned public key), native lazy-loading, and the
 * missing/404 → deterministic fallback-art swap — never a broken image.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FallbackArt from './FallbackArt.jsx';
import PosterImage, { posterUrl } from './PosterImage.jsx';

describe('posterUrl', () => {
  it('builds the OMDb image URL keyed by tconst', () => {
    expect(posterUrl('tt3896198')).toBe('https://img.omdbapi.com/?i=tt3896198&apikey=db1f8efc');
  });
});

describe('PosterImage', () => {
  it('renders a lazy-loading 2:3 img pointed at OMDb', () => {
    const { container } = render(<PosterImage tconst="tt0068646" title="The Godfather" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', posterUrl('tt0068646'));
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '40');
    expect(img).toHaveAttribute('height', '60');
  });

  it('swaps to FallbackArt on image error — never a broken image', () => {
    const { container } = render(<PosterImage tconst="tt0000000" title="Ghost Movie" />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull();
    const art = container.querySelector('.fallback-art');
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute('data-kind', 'title');
    expect(art.textContent).toContain('GM'); // initials from the title
  });

  it('renders FallbackArt directly when there is no tconst', () => {
    const { container } = render(<PosterImage title="No Id" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.fallback-art')).not.toBeNull();
  });

  it('reports settle to ladder parents (IMDB-9): onLoad fires, onError fires AND still swaps to FallbackArt', () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    const a = render(<PosterImage tconst="tt1" title="Loads" onLoad={onLoad} onError={onError} />);
    fireEvent.load(a.container.querySelector('img'));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const b = render(<PosterImage tconst="tt2" title="Fails" onError={onError} />);
    fireEvent.error(b.container.querySelector('img'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(b.container.querySelector('.fallback-art')).not.toBeNull(); // internal swap unchanged
  });
});

describe('FallbackArt', () => {
  it('is deterministic: the same entity always gets the same gradient', () => {
    const a = render(<FallbackArt id="tt0068646" label="The Godfather" />);
    const b = render(<FallbackArt id="tt0068646" label="The Godfather" />);
    const art = (r) => r.container.querySelector('.fallback-art');
    expect(art(a).getAttribute('style')).toBe(art(b).getAttribute('style'));
  });

  it('differs across entities and shows up to two initials', () => {
    const a = render(<FallbackArt id="tt0000001" label="Godfather of Harlem" />);
    const b = render(<FallbackArt id="tt9999999" label="Something Else" />);
    const art = (r) => r.container.querySelector('.fallback-art');
    expect(art(a).getAttribute('style')).not.toBe(art(b).getAttribute('style'));
    expect(art(a).textContent).toContain('GO');
  });
});

describe('people never get posters (no people-image API exists)', () => {
  it('FallbackArt person variant renders the person glyph kind', () => {
    render(<FallbackArt id="nm0000338" label="Francis Ford Coppola" kind="person" />);
    expect(document.querySelector('.fallback-art')).toHaveAttribute('data-kind', 'person');
  });
});
