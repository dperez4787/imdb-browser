/**
 * The assistant-message markdown subset from DES-7: paragraphs, lists, bold,
 * inline code, links — sanitized (no raw HTML, no unsafe URL schemes).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown.jsx';

const mount = (source) => render(<div>{renderMarkdown(source)}</div>);

describe('renderMarkdown', () => {
  it('renders paragraphs split on blank lines', () => {
    const { container } = mount('First paragraph.\n\nSecond paragraph.');
    const ps = container.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]).toHaveTextContent('First paragraph.');
    expect(ps[1]).toHaveTextContent('Second paragraph.');
  });

  it('renders unordered and ordered lists', () => {
    const { container } = mount('- The Godfather\n- Chinatown\n\n1. First\n2. Second');
    const ul = container.querySelector('ul');
    const ol = container.querySelector('ol');
    expect(ul.querySelectorAll('li')).toHaveLength(2);
    expect(ol.querySelectorAll('li')).toHaveLength(2);
    expect(ul).toHaveTextContent('Chinatown');
    expect(ol).toHaveTextContent('Second');
  });

  it('renders bold and inline code', () => {
    mount('A **classic** with `numVotes` over a million.');
    expect(screen.getByText('classic').tagName).toBe('STRONG');
    expect(screen.getByText('numVotes').tagName).toBe('CODE');
  });

  it('renders http(s) links with new-tab treatment and keeps in-app hrefs plain', () => {
    mount('[IMDb](https://imdb.com) and [the title page](/title/tt0068646)');
    const external = screen.getByRole('link', { name: 'IMDb' });
    expect(external).toHaveAttribute('href', 'https://imdb.com');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer');

    const inApp = screen.getByRole('link', { name: 'the title page' });
    expect(inApp).toHaveAttribute('href', '/title/tt0068646');
    expect(inApp).not.toHaveAttribute('target');
  });

  it('drops unsafe link schemes but keeps the words', () => {
    mount('Click [here](javascript:alert(1)) maybe');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/here/)).toBeInTheDocument();
  });

  it('never parses HTML — markup in the source stays literal text', () => {
    const { container } = mount('<img src=x onerror=alert(1)> and <b>bold?</b>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders a half-streamed construct as plain text until its closer arrives', () => {
    const { container } = mount('The **Godfa');
    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('The **Godfa');
  });
});
