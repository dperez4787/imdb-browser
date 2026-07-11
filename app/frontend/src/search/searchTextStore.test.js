/**
 * searchTextStore (IMDB-5, DES-2): the omnibox text lives above the route
 * tree — module-level store shared by every Omnibox instance, so
 * Back-then-refocus resumes and deep links can hydrate it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getSearchText,
  setSearchText,
  subscribeSearchText,
} from './searchTextStore.js';

afterEach(() => {
  setSearchText('');
});

describe('searchTextStore', () => {
  it('starts empty, stores what is set, and coerces nullish to ""', () => {
    expect(getSearchText()).toBe('');
    setSearchText('godf');
    expect(getSearchText()).toBe('godf');
    setSearchText(null);
    expect(getSearchText()).toBe('');
  });

  it('notifies subscribers on change, not on a same-value set', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSearchText(listener);

    setSearchText('godf');
    expect(listener).toHaveBeenCalledTimes(1);
    setSearchText('godf'); // no-op — useSyncExternalStore must not loop
    expect(listener).toHaveBeenCalledTimes(1);
    setSearchText('godfa');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSearchText('done');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('is shared state: a second subscriber sees the value set before it subscribed', () => {
    setSearchText('coppola');
    // What a remounting Omnibox does: read current state on subscribe.
    expect(getSearchText()).toBe('coppola');
  });
});
