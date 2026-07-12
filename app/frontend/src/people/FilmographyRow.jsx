/**
 * FilmographyRow (IMDB-8, DES-5): one credit — 32×48 poster thumb
 * (PosterImage → FallbackArt, lazy-loaded so offscreen rows of a long
 * filmography issue no OMDb request), title, year, character(s) muted (when
 * present, one line with the full text in `title=`), `★ rating` right
 * (averageRating — ungoverned; the row never reads numVotes). The whole row
 * is ONE link to the title detail page (Tab walks rows, Enter opens), same
 * pattern as DES-3's TitleCard. Below 720px the rating column drops (CSS).
 */
import { Link } from 'react-router';

import PosterImage from '../PosterImage.jsx';

export default function FilmographyRow({ entry }) {
  const { title, characters } = entry;
  const characterText = Array.isArray(characters) ? characters.filter(Boolean).join(', ') : '';
  const averageRating = title.rating?.averageRating;

  return (
    <li className="filmography-row">
      <Link className="filmography-row__link" to={`/title/${title.tconst}`}>
        <span className="filmography-row__thumb">
          <PosterImage tconst={title.tconst} title={title.primaryTitle} width={32} height={48} />
        </span>
        <span className="filmography-row__title" title={title.primaryTitle}>
          {title.primaryTitle}
        </span>
        {title.startYear != null && (
          <span className="filmography-row__year">{title.startYear}</span>
        )}
        {characterText && (
          <span className="filmography-row__characters" title={characterText}>
            {characterText}
          </span>
        )}
        {averageRating != null && (
          <span className="filmography-row__rating">
            <span aria-hidden="true">★</span> {Number(averageRating).toFixed(1)}
          </span>
        )}
      </Link>
    </li>
  );
}
