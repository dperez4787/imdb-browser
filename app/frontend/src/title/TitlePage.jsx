/**
 * TitlePage (IMDB-7, DES-4) — /title/:tconst, the title's one-sheet. Owns the
 * query (useTitleDetail — ONE GraphQL request per page view) and the state
 * switch: loading skeleton → error (query failed, Retry) → not-found
 * (`title: null`, verified distinct from error live) → the page.
 *
 * Governance (amended AC): the document selects Rating.numVotes
 * optimistically; the hook's deniedFields drives the RatingBlock's three-way
 * votes slot, and the denial-scoped 60 s staleTime means a grant flipped at
 * the console shows up on the next fresh fetch — no redeploy, no code change.
 *
 * DES-4 behavior owned here: document title becomes
 * "The Godfather (1972) — Marquee" on load (restored on unmount), and scroll
 * resets to top on navigation to this page (per-tconst, so hopping from an
 * episode to its series re-resets).
 */
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useTitleDetail } from '../graphql/titleHooks.js';
import CreditGroup from './CreditGroup.jsx';
import { formatYears, groupCredits } from './format.js';
import { ErrorState, NotFoundState } from './PageStates.jsx';
import TitleHeader from './TitleHeader.jsx';

/**
 * DES-4 loading state: poster-sized skeleton + 2 header text lines + 3
 * group-header skeletons, mirroring the loaded page's grid so nothing
 * shifts when data lands.
 */
function TitleSkeleton() {
  return (
    <div className="title-page title-skeleton" role="status" aria-label="Loading title">
      <div className="title-header">
        <div className="title-header__poster">
          <div className="title-skeleton__poster" />
        </div>
        <div className="title-header__main">
          <div className="title-skeleton__line title-skeleton__line--headline" />
          <div className="title-skeleton__line title-skeleton__line--facts" />
        </div>
      </div>
      <div className="title-credits">
        <div className="title-skeleton__line title-skeleton__line--group" />
        <div className="title-skeleton__line title-skeleton__line--group" />
        <div className="title-skeleton__line title-skeleton__line--group" />
      </div>
    </div>
  );
}

export default function TitlePage() {
  const { tconst } = useParams();
  const { data, deniedFields, isPending, error, refetch } = useTitleDetail(tconst);
  const title = data?.title;

  // Scroll resets to top on navigation to this page (DES-4 "Behavior").
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tconst]);

  // Document title on load — "The Godfather (1972) — Marquee" — restored on
  // unmount so other routes don't inherit a stale one.
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    const years = formatYears(title.startYear, title.endYear);
    document.title = `${title.primaryTitle}${years ? ` (${years})` : ''} — Marquee`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (isPending) return <TitleSkeleton />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!title) return <NotFoundState />;

  const groups = groupCredits(title.principals);

  return (
    <article className="title-page">
      <TitleHeader title={title} deniedFields={deniedFields} />
      {groups.length > 0 && (
        <div className="title-credits">
          {groups.map((group) => (
            <CreditGroup key={group.category} category={group.category} entries={group.entries} />
          ))}
        </div>
      )}
    </article>
  );
}
