/**
 * TitleBreadcrumb (IMDB-20 — title hierarchy browser): for tvEpisode titles,
 * a breadcrumb at the top of the title page placing the episode in its
 * series — `<Series title> › S<n> E<n> · <episode title>` — with the series
 * segment linking to its own detail page (/title/:tconst is this very
 * route). Non-episodes (episode == null) render nothing.
 *
 * This REPLACES TitleHeader's former "S1 · E7 of <series>" line (the ticket
 * offered keep-or-replace; showing both would state the same placement
 * twice, and the breadcrumb carries strictly more — it adds the episode's
 * own title as the current segment).
 *
 * Partial data drops silently per DES-4: no series → just the trailing
 * segment ("S1 E7 · Pilot"); no season/episode numbers → series › episode
 * title; neither series nor numbers → nothing at all.
 */
import { Link } from 'react-router';

export default function TitleBreadcrumb({ title }) {
  const episode = title?.episode;
  if (!episode) return null;

  // Breadcrumb marker uses the spaced 'S1 E7' form (the compact 'S1E7' is
  // the list-row idiom — see formatEpisodeMarker).
  const marker = [
    episode.seasonNumber != null ? `S${episode.seasonNumber}` : null,
    episode.episodeNumber != null ? `E${episode.episodeNumber}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const series = episode.series;
  if (!marker && !series) return null;

  const current = [marker, title.primaryTitle].filter(Boolean).join(' · ');

  return (
    <nav className="title-breadcrumb" aria-label="Title hierarchy">
      {series && (
        <>
          <Link className="title-breadcrumb__series" to={`/title/${series.tconst}`}>
            {series.primaryTitle}
          </Link>
          <span className="title-breadcrumb__sep" aria-hidden="true">
            ›
          </span>
        </>
      )}
      <span className="title-breadcrumb__current" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
