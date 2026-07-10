import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';

describe('App', () => {
  it('renders the imdb-browser placeholder screen', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'imdb-browser' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/rich browsing over the federated imdb graph/i),
    ).toBeVisible();
  });
});
