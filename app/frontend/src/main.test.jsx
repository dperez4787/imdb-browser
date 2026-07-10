/**
 * IMDB-1 tester coverage: the real entry module (`main.jsx`) must mount the
 * placeholder into `#root` — the same path `npm run dev` serves — with no
 * console errors. Complements App.test.jsx, which renders <App /> directly.
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('main.jsx entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts the imdb-browser placeholder into #root with no console errors', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main.jsx');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'imdb-browser' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/rich browsing over the federated imdb graph/i),
    ).toBeVisible();
    expect(document.getElementById('root')).not.toBeEmptyDOMElement();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
