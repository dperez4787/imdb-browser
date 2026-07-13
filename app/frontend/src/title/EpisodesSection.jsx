/**
 * EpisodesSection (IMDB-20 — title hierarchy browser): the downward
 * direction of the hierarchy on the title page. Renders below the credits
 * for titles whose `episodes` list is non-empty: one group per season in
 * API order (seasonNumber null → "Specials"), each row `S#E#` + primary
 * title (a link to that episode's own page) + muted start year — the same
 * visual idiom as DES-4's credit groups (muted uppercase group headers,
 * grid rows).
 *
 * Data: its OWN query via useTitleEpisodes (limit 60, offset paging) —
 * deliberately not part of TITLE_DETAIL_QUERY, so the page's first paint
 * stays one lean entity query. `Title.episodes` has no total count, so the
 * "Load more" button renders exactly while `hasNextPage` (= the last page
 * came back full); a short page is the end.
 *
 * States:
 *   - resolves empty (movies, leaf titles) → ZERO DOM: no header, no
 *     spinner placeholder, nothing — the section is invisible on pages
 *     that have no children. Loading renders nothing for the same reason
 *     (a skeleton here would flash a phantom section on every movie).
 *   - first fetch fails → one quiet line + Retry (hiding a failure would
 *     silently amputate a series' episode list; on the rare movie-page
 *     failure the line is honest and harmless).
 *   - a Load-more fetch fails → the loaded groups stay, the same quiet
 *     line + Retry appears after them.
 */
import { Link } from 'react-router';

import { useTitleEpisodes } from '../graphql/episodeHooks.js';
import { formatEpisodeMarker, groupEpisodesBySeason } from './format.js';

function EpisodeRow({ episode }) {
  const marker = formatEpisodeMarker(episode.episode);
  return (
    <li className="episode-row">
      {marker && <span className="episode-row__marker">{marker}</span>}
      <Link className="episode-row__title" to={`/title/${episode.tconst}`}>
        {episode.primaryTitle}
      </Link>
      {episode.startYear != null && (
        <span className="episode-row__year">{episode.startYear}</span>
      )}
    </li>
  );
}

export default function EpisodesSection({ tconst }) {
  const { episodes, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTitleEpisodes(tconst);

  // Zero DOM while resolving and when the list resolves empty — a movie's
  // page must not grow a phantom "Episodes" frame, ever.
  if (isPending && !error) return null;

  const groups = groupEpisodesBySeason(episodes);
  if (groups.length === 0 && !error) return null;

  return (
    <section className="episodes-section" aria-label="Episodes">
      {groups.length > 0 && <h2 className="episodes-section__title">Episodes</h2>}
      {groups.map((group) => (
        <div key={group.key} className="episode-group">
          <h3 className="episode-group__header">{group.label}</h3>
          <ol className="episode-group__list">
            {group.episodes.map((episode) => (
              <EpisodeRow key={episode.tconst} episode={episode} />
            ))}
          </ol>
        </div>
      ))}
      {error && (
        <p className="episodes-section__error">
          Couldn’t load episodes.{' '}
          <button
            type="button"
            className="episodes-section__more"
            onClick={() => (episodes.length > 0 ? fetchNextPage() : refetch())}
          >
            Retry
          </button>
        </p>
      )}
      {!error && hasNextPage && (
        <button
          type="button"
          className="episodes-section__more"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
