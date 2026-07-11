/**
 * RestrictedValue (IMDB-14) — the shared restricted-field treatment,
 * specified by designs/DES-8-restricted-field-treatment.md.
 *
 * A governed value the router denied is a REDACTION, not an absence: a static
 * hatched pill with a lock glyph sits exactly where the value would sit,
 * saying "a value exists here and this app hasn't been granted it". Missing
 * data (null value, coordinate NOT denied) renders nothing — never this.
 * The two-rule contract every call site follows:
 *
 *   1. isRestricted(deniedFields, coordinate) → render <RestrictedValue>.
 *   2. Value null/absent and NOT denied → the view's ordinary missing rule.
 *
 * `deniedFields` comes from the query hooks (src/graphql/) — this component
 * never parses errors and never guesses at nulls. It renders NO animation,
 * ever: the static hatch is the visual discriminator against loading
 * skeletons, which shimmer. Tooltip opens on hover AND keyboard focus (a
 * title attribute would leave keyboard users out); Esc dismisses it with
 * focus staying on the pill. Screen readers get the visually-hidden text
 * "<Label>: restricted by data governance." — hatch, lock, and tooltip are
 * aria-hidden decoration so nothing announces twice.
 */
import { useState } from 'react';

/**
 * The two-rule contract's predicate: is this coordinate denied? Call sites
 * use this instead of string-matching deniedFields inline (DES-8).
 *
 * @param {string[]|undefined} deniedFields  from a query hook
 * @param {string} coordinate  `Type.field`, e.g. 'Rating.numVotes'
 * @returns {boolean}
 */
export function isRestricted(deniedFields, coordinate) {
  return Array.isArray(deniedFields) && deniedFields.includes(coordinate);
}

/** Tiny padlock, ~10px, muted — the one ornament that earns its place. */
function LockGlyph() {
  return (
    <svg
      className="restricted-value__lock"
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      focusable="false"
    >
      <path
        d="M3.1 4.6V3.2a1.9 1.9 0 0 1 3.8 0v1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x="1.6" y="4.4" width="6.8" height="4.6" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * The redaction pill.
 *
 * @param {object} props
 * @param {string} props.coordinate  the `Type.field` the view wanted (e.g.
 *   'Rating.numVotes'); emitted as data-coordinate for tests, never shown.
 * @param {string} props.label  human label for tooltip/SR text ("Vote count").
 * @param {'inline'|'line'} [props.variant]  inline (default) for a value
 *   embedded in text or a tight slot; line for a slot that is a whole line of
 *   its own (adds the small-caps RESTRICTED word).
 * @param {string} [props.width]  em-width hint for the inline pill (DES-8
 *   default 3.5em; e.g. '2.5em' for a 4-digit year).
 */
export default function RestrictedValue({
  coordinate,
  label,
  variant = 'inline',
  width = '3.5em',
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <span
      className={`restricted-value restricted-value--${variant}`}
      data-coordinate={coordinate}
      tabIndex={0}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
      onKeyDown={(event) => {
        // Esc closes the tooltip, focus stays on the pill. Not a button:
        // Enter/Space do nothing and it never navigates.
        if (event.key === 'Escape') setTooltipOpen(false);
      }}
    >
      <span className="restricted-value__pill" aria-hidden="true" style={{ width }}>
        <LockGlyph />
      </span>
      {variant === 'line' && (
        <span className="restricted-value__word" aria-hidden="true">
          Restricted
        </span>
      )}
      <span className="restricted-value__sr">{label}: restricted by data governance.</span>
      {tooltipOpen && (
        <span className="restricted-value__tooltip" aria-hidden="true">
          <strong className="restricted-value__tooltip-head">Restricted</strong>
          <span className="restricted-value__tooltip-body">
            {label} is governed data this app hasn’t been granted. If access is granted, it
            appears here automatically.
          </span>
        </span>
      )}
    </span>
  );
}
