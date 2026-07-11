/**
 * SearchFreshness (IMDB-13, folded into IMDB-5 per DES-2): the honest small
 * print under search results. Exported standalone so DES-3's faceted view
 * mounts the identical component above its grid.
 *
 * Rules (DES-2 "Freshness footer"):
 *   - searchInfo unavailable/errored → render NOTHING (absence, never a guess).
 *   - rebuiltAt null → the index has never been built: "Index not yet built".
 *   - under 24h → "Index rebuilt 3 h ago" / "45 min ago" / "just now" (<60s).
 *   - older → "Index rebuilt Jul 3".
 *   - hovering/focusing the info mark shows the absolute timestamp (title=).
 */

/** Relative/absolute wording for a rebuild timestamp. Exported for tests. */
export function formatRebuilt(iso, now = new Date()) {
  const then = new Date(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SearchFreshness({ searchInfo }) {
  if (!searchInfo) return null;

  const { rebuiltAt } = searchInfo;
  const neverBuilt = rebuiltAt == null;
  const text = neverBuilt ? 'Index not yet built' : `Index rebuilt ${formatRebuilt(rebuiltAt)}`;
  const absolute = neverBuilt
    ? 'The search index has never been rebuilt.'
    : new Date(rebuiltAt).toISOString();

  return (
    <div className="search-freshness">
      <span>{text}</span>
      {/* Decorative pointer affordance, per DES-2: "(title attribute is
          sufficient)". Deliberately NOT focusable and no aria-label: the
          combobox closes the panel on Tab, so keyboard focus could never
          reach a tab stop in here anyway — a focusable role-less span would
          be a phantom stop wherever SearchFreshness is reused (DES-3). The
          visible text line is the accessible content. */}
      <span className="search-freshness__info" title={absolute} aria-hidden="true">
        ⓘ
      </span>
    </div>
  );
}
