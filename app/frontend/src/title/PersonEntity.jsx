/**
 * PersonEntity (IMDB-7, DES-4): one credit entry — Monogram + name, with the
 * character text (cast only) muted to the right, truncated to one line with
 * the full text in `title`.
 *
 * PRE-IMDB-8 TREATMENT (the ticket's "nothing 404s" criterion): person chips
 * render NON-INTERACTIVE — same anatomy as the future link, but a <span>
 * with no anchor, default cursor, not in the tab order. IMDB-8's landing
 * upgrades this component with an `interactive` prop gating a Link to
 * /person/:nconst (DES-4 "Components"); the nconst is already in the DOM
 * (data-nconst) and in the data, so that flip touches only this file.
 */
import Monogram from '../Monogram.jsx';

export default function PersonEntity({ person, characters }) {
  const characterText = Array.isArray(characters) ? characters.filter(Boolean).join(', ') : '';
  return (
    <span className="person-entity" data-nconst={person.nconst}>
      <Monogram text={person.primaryName} seed={person.nconst} size={28} />
      <span className="person-entity__name">{person.primaryName}</span>
      {characterText && (
        <span className="person-entity__character" title={characterText}>
          {characterText}
        </span>
      )}
    </span>
  );
}
