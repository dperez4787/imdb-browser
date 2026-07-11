/**
 * Paginator (IMDB-6, DES-3): Prev / `Page N of M` / Next over deterministic
 * server paging. Bounds and the capped label come from urlState so the same
 * rules apply on a fresh URL load: Prev off on page 1, Next off on the last
 * reachable page, and `Page N of 417+` when the API stops counting at 10k
 * (`totalIsCapped`) — offset can never exceed 10,000.
 */
import { isNextDisabled, isPrevDisabled, pageLabel } from './urlState.js';

export default function Paginator({ page, total, totalIsCapped, onPage }) {
  const prevDisabled = isPrevDisabled(page);
  const nextDisabled = isNextDisabled(page, total, totalIsCapped);
  return (
    <nav className="paginator" aria-label="Pagination">
      <button
        type="button"
        className="paginator__btn"
        disabled={prevDisabled}
        onClick={() => onPage(page - 1)}
      >
        ◀ Prev
      </button>
      <span className="paginator__label" aria-live="polite">
        {pageLabel(page, total, totalIsCapped)}
      </span>
      <button
        type="button"
        className="paginator__btn"
        disabled={nextDisabled}
        onClick={() => onPage(page + 1)}
      >
        Next ▶
      </button>
    </nav>
  );
}
