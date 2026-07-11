/**
 * TitleHeader (IMDB-7, DES-4): poster (PosterImage at DES-4's 260px one-sheet
 * size — OMDb budget for this page is exactly 1, FallbackArt on missing/404),
 * h1, episode context for tvEpisode titles, the fact line
 * (years · type · runtime — each segment dropping out silently when absent),
 * the RatingBlock (with its governed votes slot), and GenreChips.
 *
 * Episode context: when `episode` is present, a line under the h1 places the
 * episode in its series — "S1 · E7 of <series>" — with the series title
 * linking to its own detail page (/title/:tconst is this very route, so the
 * link is live today). Absent parts drop silently, per the partial-data rule.
 */
import { Link } from 'react-router';

import PosterImage from '../PosterImage.jsx';
import { formatRuntime, formatTitleType, formatYears } from './format.js';
import GenreChips from './GenreChips.jsx';
import RatingBlock from './RatingBlock.jsx';

function EpisodeContext({ episode }) {
  if (!episode) return null;
  const marker = [
    episode.seasonNumber != null ? `S${episode.seasonNumber}` : null,
    episode.episodeNumber != null ? `E${episode.episodeNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const series = episode.series;
  if (!marker && !series) return null;
  return (
    <p className="title-header__episode">
      {marker && <span>{marker}</span>}
      {series && (
        <>
          {marker ? ' of ' : 'Episode of '}
          <Link to={`/title/${series.tconst}`}>{series.primaryTitle}</Link>
        </>
      )}
    </p>
  );
}

export default function TitleHeader({ title, deniedFields }) {
  const facts = [
    formatYears(title.startYear, title.endYear),
    formatTitleType(title.titleType),
    formatRuntime(title.runtimeMinutes),
  ].filter(Boolean);

  return (
    <header className="title-header">
      <div className="title-header__poster">
        <PosterImage tconst={title.tconst} title={title.primaryTitle} width={260} height={390} />
      </div>
      <div className="title-header__main">
        <h1 className="title-header__name">{title.primaryTitle}</h1>
        <EpisodeContext episode={title.episode} />
        <div className="title-header__row">
          {facts.length > 0 && <p className="title-header__facts">{facts.join(' · ')}</p>}
          <RatingBlock rating={title.rating} deniedFields={deniedFields} />
        </div>
        <GenreChips genres={title.genres} />
      </div>
    </header>
  );
}
