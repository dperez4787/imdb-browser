/**
 * Omnibox (IMDB-5, DES-2): the product's one search input. Hero (on `/`) and
 * compact (TopBar) are size variants of this single component — same panel,
 * same behavior.
 *
 *   - ARIA combobox: focus stays in the input, selection moves via
 *     aria-activedescendant; row 1 preselected; arrows wrap; Enter opens the
 *     selected row; Esc closes the panel, a second Esc blurs; Tab closes and
 *     moves on. aria-expanded/aria-controls are set only while the listbox
 *     element actually exists (skeleton/no-results/error bodies are not a
 *     listbox — pointing aria-controls at nothing is a dangling reference).
 *     Option ids embed the entity id (tconst/nconst), not the row index, so
 *     aria-activedescendant changes textually when the result set changes
 *     and screen readers re-announce the active option.
 *   - `/` or Cmd/Ctrl+K focuses it from anywhere (unless focus is already in
 *     a text input) — DES-1 shared keyboard language. Below 720px (compact)
 *     that means opening the mobile overlay first and focusing after the
 *     re-render paints the field; at desktop widths it must NOT touch the
 *     overlay state, or the two-Esc model breaks.
 *   - The query text lives in searchTextStore.js, ABOVE the route tree, so
 *     Back-then-refocus resumes where the user was (DES-2) even though the
 *     hero omnibox unmounts with HomePage.
 *   - Debounce + the single aliased request live in useUniversalSearch
 *     (src/graphql/searchHooks.js); row order comes from the server-ranked
 *     union plus Appendix A's prefix fill (mergeRows.js).
 *   - A title row navigates to /title/:tconst, a person row to
 *     /person/:nconst. Enter with no rows to open goes to the reserved
 *     /search?q=… placeholder route. Selecting clears nothing — the query
 *     text stays.
 *   - Below 720px (compact only) the input collapses to an icon button that
 *     expands to a full-width overlay row; ✕/Esc closes the overlay (DES-2)
 *     and returns focus to the toggle — the ✕ close control renders whenever
 *     the overlay is open, text or not, because touch devices have no Esc.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { MIN_QUERY_LENGTH, PANEL_ROW_LIMIT, useUniversalSearch } from '../graphql/searchHooks.js';
import AutocompletePanel from './AutocompletePanel.jsx';
import { assembleRows } from './mergeRows.js';
import { useSearchText } from './searchTextStore.js';

export default function Omnibox({ variant = 'compact', autoFocus = false }) {
  const [text, setText] = useSearchText();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const navigate = useNavigate();
  const reactId = useId();
  const listboxId = `omnibox-listbox-${reactId}`;
  const optionId = (entityId) => `omnibox-option-${reactId}-${entityId}`;

  const trimmed = text.trim();
  const active = trimmed.length >= MIN_QUERY_LENGTH;
  const panelOpen = open && active;

  const search = useUniversalSearch(text);
  const rows = useMemo(
    () => (search.data ? assembleRows(search.data, PANEL_ROW_LIMIT) : []),
    [search.data],
  );
  // The listbox element exists only when the panel body IS the row list
  // (mirrors AutocompletePanel's branch order: error wins over rows).
  const listboxVisible = panelOpen && !search.error && rows.length > 0;
  const selectedRow = rows[selectedIndex] ?? rows[0];

  // Row 1 preselected whenever the row set changes (DES-2 keyboard model).
  const rowsKey = rows.map((r) => r.id).join('|');
  useEffect(() => {
    setSelectedIndex(0);
  }, [rowsKey]);

  // The compact variant collapses to the icon-toggle + overlay below 720px.
  // Read at call time (not render time) so a resize between events is seen.
  const isMobileCompact = () =>
    variant === 'compact' && Boolean(window.matchMedia?.('(max-width: 720px)').matches);

  // Closing the overlay returns focus to the search toggle (the input it
  // leaves behind is display:none — without this, focus falls to <body>).
  // Pointer-driven closes (outside click, row click) skip the restore: the
  // pointer already chose where the user is going.
  const closeMobileOverlay = ({ restoreFocus = true } = {}) => {
    setOpen(false);
    setMobileOpen(false);
    if (restoreFocus) mobileToggleRef.current?.focus();
  };

  // Global focus shortcut: `/` or Cmd/Ctrl+K, unless typing somewhere else.
  useEffect(() => {
    const onKeyDown = (event) => {
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const cmdK = (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey);
      if (!slash && !cmdK) return;
      const el = document.activeElement;
      if (el === inputRef.current) {
        // Already here; just keep the browser from hijacking Cmd+K.
        if (cmdK) event.preventDefault();
        return;
      }
      const inTextField =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (inTextField) return;
      event.preventDefault();
      if (isMobileCompact()) {
        // The collapsed field is display:none until the overlay class lands
        // in the DOM — focusing now would silently no-op. Same rAF path as
        // the icon tap.
        setMobileOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- variant is a stable prop
  }, [variant]);

  // Clicking outside closes the panel (and the mobile overlay).
  useEffect(() => {
    if (!panelOpen && !mobileOpen) return undefined;
    const onMouseDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        if (mobileOpen) closeMobileOverlay({ restoreFocus: false });
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
    // closeMobileOverlay only touches stable setters/refs, so these two are
    // the only real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, mobileOpen]);

  const openRow = (row) => {
    setOpen(false);
    if (mobileOpen) closeMobileOverlay({ restoreFocus: false });
    navigate(row.kind === 'title' ? `/title/${row.id}` : `/person/${row.id}`);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!panelOpen) {
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedIndex((i) => (i + delta + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (panelOpen && rows.length > 0) {
        openRow(selectedRow);
      } else if (trimmed) {
        // No rows to open: the reserved full-results route (a placeholder
        // page until a follow-up spec designs it).
        setOpen(false);
        if (mobileOpen) closeMobileOverlay({ restoreFocus: false });
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (panelOpen) setOpen(false);
      else if (mobileOpen) closeMobileOverlay();
      else inputRef.current?.blur();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const clear = () => {
    setText('');
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`omnibox omnibox--${variant}${mobileOpen ? ' omnibox--mobile-open' : ''}`}
    >
      {variant === 'compact' && (
        <button
          ref={mobileToggleRef}
          type="button"
          className="omnibox__mobile-toggle"
          aria-label="Search"
          onClick={() => {
            setMobileOpen(true);
            // Focus after the overlay input becomes visible.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          🔍
        </button>
      )}
      <div className="omnibox__field">
        <span className="omnibox__icon" aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          className="omnibox__input"
          type="text"
          role="combobox"
          aria-expanded={listboxVisible}
          aria-controls={listboxVisible ? listboxId : undefined}
          aria-activedescendant={listboxVisible && selectedRow ? optionId(selectedRow.id) : undefined}
          aria-autocomplete="list"
          aria-label="Search titles & people"
          placeholder="Search titles & people…"
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            setOpen(value.trim().length >= MIN_QUERY_LENGTH);
          }}
          onFocus={() => {
            if (active) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {text || mobileOpen ? (
          // DES-2 mobile: "✕/Esc closes it" — with the overlay open the ✕ IS
          // the close control (rendered even with no text; touch has no Esc)
          // and does not clear the query, exactly like Esc. Desktop keeps the
          // clear semantics: ✕ clears text, closes the panel, keeps focus.
          <button
            type="button"
            className="omnibox__clear"
            aria-label={mobileOpen ? 'Close search' : 'Clear search'}
            onClick={mobileOpen ? () => closeMobileOverlay() : clear}
          >
            ✕
          </button>
        ) : (
          <kbd className="omnibox__kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      {panelOpen && (
        <AutocompletePanel
          query={search.debouncedQuery || trimmed}
          rows={rows}
          error={search.error}
          isPending={search.isPending}
          isRefreshing={Boolean(search.isFetching || search.isPlaceholderData)}
          hasData={search.data != null}
          searchInfo={search.data?.searchInfo}
          selectedIndex={selectedIndex}
          listboxId={listboxId}
          optionId={optionId}
          onRetry={() => search.refetch()}
          onSelectRow={openRow}
          onHoverRow={setSelectedIndex}
        />
      )}
    </div>
  );
}
