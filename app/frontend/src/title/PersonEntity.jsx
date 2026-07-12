/**
 * PersonEntity (IMDB-7 anatomy, IMDB-8 interaction): one credit entry —
 * Monogram + name, with the character text (cast only) muted to the right,
 * truncated to one line with the full text in `title`.
 *
 * INTERACTIVE since IMDB-8: the chip is ONE Link to /person/:nconst (DES-4
 * "Components" reserved exactly this upgrade; the person detail page now
 * exists, so the pre-IMDB-8 non-interactive <span> treatment is retired).
 * Same anatomy, same data-nconst hook for tests — only the element and the
 * navigation changed, completing the title ↔ person cross-navigation loop.
 */
import { Link } from 'react-router';

import Monogram from '../Monogram.jsx';

export default function PersonEntity({ person, characters }) {
  const characterText = Array.isArray(characters) ? characters.filter(Boolean).join(', ') : '';
  return (
    <Link className="person-entity" data-nconst={person.nconst} to={`/person/${person.nconst}`}>
      <Monogram text={person.primaryName} seed={person.nconst} size={28} />
      <span className="person-entity__name">{person.primaryName}</span>
      {characterText && (
        <span className="person-entity__character" title={characterText}>
          {characterText}
        </span>
      )}
    </Link>
  );
}
