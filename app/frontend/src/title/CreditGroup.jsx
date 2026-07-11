/**
 * CreditGroup (IMDB-7, DES-4): one crew category from the data — header is
 * the category's own words (underscores → spaces in format.js, uppercased by
 * CSS), entries are PersonEntity chips. Groups with no members never reach
 * this component (groupCredits drops them). Long lists render fully — no
 * pagination, no accordion (DES-4's "lobby card, not a database dump" is
 * about grouping, not truncation).
 */
import { formatCategory } from './format.js';
import PersonEntity from './PersonEntity.jsx';

export default function CreditGroup({ category, entries }) {
  if (!entries?.length) return null;
  return (
    <section className="credit-group" data-category={category}>
      <h2 className="credit-group__header">{formatCategory(category)}</h2>
      <ul className="credit-group__list">
        {entries.map((entry) => (
          <li key={`${entry.name.nconst}-${entry.ordering ?? entry.name.nconst}`}>
            <PersonEntity person={entry.name} characters={entry.characters} />
          </li>
        ))}
      </ul>
    </section>
  );
}
