/**
 * PersonPage (IMDB-8, DES-5) — /person/:nconst, the person's billing page,
 * replacing the IMDB-5 placeholder on the same route. Owns the query
 * (usePersonDetail — ONE GraphQL request per page view) and the state
 * switch: loading skeleton → error (query failed, Retry) → not-found
 * (`name: null`, verified live to be distinct from error) → the page.
 *
 * Governance (amended AC): the document selects Name.birthYear/deathYear
 * optimistically; the hook's deniedFields drives the lifespan line's DES-8
 * treatment (PersonHeader), and the denial-scoped 60 s staleTime means a
 * grant flipped at the console shows real years on the next fresh fetch —
 * no redeploy, no code change. Nothing this page renders depends on a
 * governed field, so a denial never fails a query or blanks a section.
 *
 * DES-5 behavior owned here: document title becomes "Al Pacino — Marquee"
 * on load (restored on unmount), and scroll resets to top on navigation
 * (per-nconst, so hopping person → person re-resets).
 */
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { usePersonDetail } from '../graphql/personHooks.js';
import { ErrorState, NotFoundState } from '../title/PageStates.jsx';
import FilmographyGroup from './FilmographyGroup.jsx';
import KnownForStrip from './KnownForStrip.jsx';
import { groupFilmography } from './personFormat.js';
import PersonHeader from './PersonHeader.jsx';

/**
 * DES-5 loading state: square visual skeleton + 2 header text lines, 4
 * poster-card skeletons for the known-for strip, 6 row skeletons for the
 * filmography — mirroring the loaded page's layout so nothing shifts when
 * data lands. Shimmers (the RestrictedValue hatch never does).
 */
function PersonSkeleton() {
  return (
    <div className="person-page person-skeleton" role="status" aria-label="Loading person">
      <div className="person-header">
        <div className="person-header__visual">
          <div className="person-skeleton__visual" />
        </div>
        <div className="person-header__main">
          <div className="person-skeleton__line person-skeleton__line--headline" />
          <div className="person-skeleton__line person-skeleton__line--facts" />
        </div>
      </div>
      <div className="person-skeleton__strip">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="person-skeleton__card" />
        ))}
      </div>
      <div className="person-skeleton__rows">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="person-skeleton__line person-skeleton__line--row" />
        ))}
      </div>
    </div>
  );
}

export default function PersonPage() {
  const { nconst } = useParams();
  const { data, deniedFields, isPending, error, refetch } = usePersonDetail(nconst);
  const person = data?.name;

  // Scroll resets to top on navigation to this page (DES-5 "Behavior").
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [nconst]);

  // Document title on load — "Al Pacino — Marquee" — restored on unmount so
  // other routes don't inherit a stale one.
  useEffect(() => {
    if (!person) return undefined;
    const previous = document.title;
    document.title = `${person.primaryName} — Marquee`;
    return () => {
      document.title = previous;
    };
  }, [person]);

  if (isPending) return <PersonSkeleton />;
  if (error) return <ErrorState message="Couldn’t load this person." onRetry={() => refetch()} />;
  if (!person) return <NotFoundState subject="person" />;

  const groups = groupFilmography(person.credits);

  return (
    <article className="person-page">
      <PersonHeader person={person} deniedFields={deniedFields} />
      <KnownForStrip titles={person.knownForTitles} />
      {groups.length > 0 ? (
        <section className="filmography" aria-labelledby="filmography-header">
          <h2 className="filmography__header" id="filmography-header">
            Filmography
          </h2>
          {groups.map((group) => (
            <FilmographyGroup
              key={group.category}
              category={group.category}
              entries={group.entries}
            />
          ))}
        </section>
      ) : (
        <p className="person-page__empty">No credited titles in the index.</p>
      )}
    </article>
  );
}
