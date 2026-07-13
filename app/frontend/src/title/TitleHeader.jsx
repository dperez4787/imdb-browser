/**
 * TitleHeader (IMDB-7, DES-4): poster (PosterImage at DES-4's 260px one-sheet
 * size — OMDb budget for this page is exactly 1, FallbackArt on missing/404),
 * h1, the fact line (years · type · runtime — each segment dropping out
 * silently when absent), the RatingBlock (with its governed votes slot), and
 * GenreChips.
 *
 * Episode context moved OUT of this header in IMDB-20: the former
 * "S1 · E7 of <series>" line under the h1 is superseded by the
 * TitleBreadcrumb at the top of the page (TitlePage renders it), so the
 * placement is stated exactly once.
 */
import PosterImage from '../PosterImage.jsx';
import { formatRuntime, formatTitleType, formatYears } from './format.js';
import GenreChips from './GenreChips.jsx';
import RatingBlock from './RatingBlock.jsx';

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
        <div className="title-header__row">
          {facts.length > 0 && <p className="title-header__facts">{facts.join(' · ')}</p>}
          <RatingBlock rating={title.rating} deniedFields={deniedFields} />
        </div>
        <GenreChips genres={title.genres} />
      </div>
    </header>
  );
}
