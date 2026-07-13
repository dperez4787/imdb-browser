/**
 * EpisodesPopover (IMDB-20 — episodes popover on the /titles grid): the "…"
 * affordance a series-like TitleCard wears, plus the popover it opens. The
 * popover peeks at the series' first episodes (limit 12, the same
 * useTitleEpisodes hook as the title page's section) and links each row —
 * and the "All episodes →" footer — into the title route, where the full
 * season-grouped section lives.
 *
 * Lazy: the query is `enabled` only after the first open, so a grid of 24
 * series costs ZERO extra requests until someone actually asks; reopening
 * rides the 1 h cache (one fetch, ever, per card mount). No posters inside
 * — text rows only, so the popover's OMDb budget is exactly 0.
 *
 * Interaction (the UserMenu's patterns): real <button> trigger
 * (aria-haspopup="dialog", aria-expanded, aria-label "Episodes of <title>"),
 * focus moves into the popover on open, Esc closes and returns focus to the
 * button, click/tap outside closes. The button lives INSIDE the card's <li>
 * but OUTSIDE its main <Link>; its click handler still calls
 * preventDefault + stopPropagation so no ancestor click-through (present or
 * future) can ever turn "peek at episodes" into a navigation.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { useTitleEpisodes, EPISODES_PEEK_SIZE } from '../graphql/episodeHooks.js';
import { formatEpisodeMarker } from '../title/format.js';

export default function EpisodesPopover({ tconst, titleName }) {
  const [open, setOpen] = useState(false);
  // Latches true on first open and stays true: the fetch happens once, and
  // close/reopen renders from cache instead of refetching.
  const [everOpened, setEverOpened] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);

  const { episodes, isPending, error, refetch } = useTitleEpisodes(tconst, {
    limit: EPISODES_PEEK_SIZE,
    enabled: everOpened,
  });

  // Close on click/tap outside (UserMenu's listener shape).
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Focus moves into the popover on open — the dialog itself, so the move
  // works in every state (the loading skeleton has nothing focusable).
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  function toggle(event) {
    // Never a navigation: the card's main Link keeps its whole surface, and
    // this click must not bubble into it (or any future card-level handler).
    event.preventDefault();
    event.stopPropagation();
    setEverOpened(true);
    setOpen((wasOpen) => !wasOpen);
  }

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div className="episodes-popover" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="episodes-popover__button"
        aria-label={`Episodes of ${titleName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden="true">…</span>
      </button>
      {open && (
        // The keydown handler implements the Esc-close + focus-return
        // contract for the focus placed inside on open (UserMenu pattern).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={dialogRef}
          className="episodes-popover__panel"
          role="dialog"
          aria-label={`Episodes of ${titleName}`}
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
        >
          {isPending ? (
            <div className="episodes-popover__loading" role="status" aria-label="Loading episodes">
              <span className="skeleton-line episodes-popover__skeleton" />
              <span className="skeleton-line episodes-popover__skeleton" />
              <span className="skeleton-line episodes-popover__skeleton" />
            </div>
          ) : error ? (
            <p className="episodes-popover__error">
              Couldn’t load episodes.{' '}
              <button type="button" className="episodes-popover__retry" onClick={() => refetch()}>
                Retry
              </button>
            </p>
          ) : episodes.length === 0 ? (
            <p className="episodes-popover__empty">No episodes found</p>
          ) : (
            <>
              <ol className="episodes-popover__list">
                {episodes.map((episode) => {
                  const marker = formatEpisodeMarker(episode.episode);
                  return (
                    <li key={episode.tconst} className="episodes-popover__row">
                      <Link className="episodes-popover__link" to={`/title/${episode.tconst}`}>
                        {marker && (
                          <span className="episodes-popover__marker">{marker}</span>
                        )}
                        <span className="episodes-popover__name">{episode.primaryTitle}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <Link className="episodes-popover__all" to={`/title/${tconst}`}>
                All episodes →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
