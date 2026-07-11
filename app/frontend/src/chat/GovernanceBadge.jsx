/**
 * GovernanceBadge — the streamed restricted-fields footer on an assistant
 * message (designs/DES-7-chat-concierge.md, "Addendum — streamed governance
 * badge", IMDB-16).
 *
 * The router runs transparent redact mode: a tool result for a user lacking a
 * role comes back healthy with governed fields absent and their coordinates in
 * `extensions.governance.redactedFields`, forwarded by the backend on the SSE
 * `tool` event. Two voices then tell the user: the assistant's PROSE explains it
 * in plain language, and this badge is the machine CORROBORATION — the exact
 * coordinates policy withheld, pinned quietly at the foot of the message. It
 * corroborates, never headlines.
 *
 * Adapts DES-8's hatch+lock swatch as a MUTED ANNOTATION LINE (not an inline
 * value pill): a stated, deliberate divergence from DES-8's never-show-
 * coordinates rule — chat has no call-site label, so the prose is the human
 * layer and the raw coordinates are the ground-truth corroboration. STATIC
 * always: no shimmer, no animation, no amber — the hatch means WITHHELD, not
 * activity. Tooltip opens on hover AND keyboard focus (Esc dismisses); the
 * swatch and tooltip are aria-hidden decoration and the meaning is carried by
 * the visually-hidden accessible text, which the base spec already announces via
 * the message list's aria-live — no separate live region, no double announce.
 *
 * `redactedFields` arrives already unioned/deduped (useChatSession does that);
 * an empty/absent list renders NOTHING — no DOM, no reserved space, the
 * overwhelmingly common case that must cost zero.
 */
import { useEffect, useState } from 'react';

// At most this many coordinates on the visible line; the rest fold into
// "+N more", which the tooltip's full list resolves.
const MAX_SHOWN = 3;

/** Tiny padlock, ~10px, muted — the recognizable "withheld" mark (DES-8). */
function LockGlyph() {
  return (
    <svg
      className="chat-governance__lock"
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      focusable="false"
    >
      <path d="M3.1 4.6V3.2a1.9 1.9 0 0 1 3.8 0v1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.6" y="4.4" width="6.8" height="4.6" rx="1" fill="currentColor" />
    </svg>
  );
}

export default function GovernanceBadge({ redactedFields }) {
  // Hover and focus are independent openers (DES-8): the tooltip is open while
  // hovered OR focused, so mousing away from a keyboard-focused badge never
  // steals its tooltip. `dismissed` (Esc) overrides both until fresh intent.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tooltipOpen = (hovered || focused) && !dismissed;

  // Esc must dismiss a hover-opened tooltip too, and an unfocused badge never
  // receives keydown — so listen on the document, but only while open.
  useEffect(() => {
    if (!tooltipOpen) return undefined;
    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [tooltipOpen]);

  const fields = Array.isArray(redactedFields)
    ? redactedFields.filter((f) => typeof f === 'string' && f.length > 0)
    : [];
  // Zero governance → zero DOM (default, common case).
  if (fields.length === 0) return null;

  const shown = fields.slice(0, MAX_SHOWN);
  const overflow = fields.length - shown.length;

  return (
    <div
      className="chat-governance"
      data-coordinates={fields.join(',')}
      tabIndex={0}
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false); // fresh intent re-opens after an Esc
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        // Esc closes the tooltip; focus stays. Not a button — Enter/Space do
        // nothing and it never navigates.
        if (event.key === 'Escape') setDismissed(true);
      }}
    >
      <span className="chat-governance__swatch" aria-hidden="true">
        <LockGlyph />
      </span>
      {/* Visible line is aria-hidden decoration; the meaning is the SR text. */}
      <span className="chat-governance__line" aria-hidden="true">
        <span className="chat-governance__label">Restricted for your role:</span>{' '}
        {shown.map((field, i) => (
          <span key={field} className="chat-governance__coord">
            {field}
            {i < shown.length - 1 ? ', ' : ''}
          </span>
        ))}
        {overflow > 0 && <span className="chat-governance__more"> +{overflow} more</span>}
      </span>
      <span className="chat-governance__sr">Restricted for your role: {fields.join(', ')}.</span>
      {tooltipOpen && (
        <span className="chat-governance__tooltip" aria-hidden="true">
          <strong className="chat-governance__tooltip-head">Restricted</strong>
          <span className="chat-governance__tooltip-body">
            Your role isn’t granted these fields: {fields.join(', ')}. The concierge answered
            without them — it sees exactly what you see. If access is granted, ask again and the
            real values appear.
          </span>
        </span>
      )}
    </div>
  );
}
