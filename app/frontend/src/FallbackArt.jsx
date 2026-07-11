// FallbackArt (DES-1 shared visual language, first consumer DES-2): the
// designed stand-in when a poster is missing or 404s — a deterministic
// two-stop gradient (hue hashed from the entity id, so the same entity always
// looks the same), up to two initials centered, and a small corner glyph:
// film-frame for titles, person for people. Never a broken-image icon,
// never a gray void.
import { hueFromString, initialsFrom } from './Monogram.jsx';

function FilmGlyph() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <rect x="0.5" y="1.5" width="9" height="7" rx="1" fill="none" stroke="currentColor" />
      <rect x="2" y="0.5" width="1.4" height="1.6" fill="currentColor" />
      <rect x="6.6" y="0.5" width="1.4" height="1.6" fill="currentColor" />
      <rect x="2" y="7.9" width="1.4" height="1.6" fill="currentColor" />
      <rect x="6.6" y="7.9" width="1.4" height="1.6" fill="currentColor" />
    </svg>
  );
}

function PersonGlyph() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <circle cx="5" cy="3" r="2" fill="currentColor" />
      <path d="M1 10 a4 4 0 0 1 8 0 Z" fill="currentColor" />
    </svg>
  );
}

export default function FallbackArt({ id, label, kind = 'title', width = 40, height = 60 }) {
  const hue = hueFromString(id ?? label ?? '');
  return (
    <span
      className="fallback-art"
      data-kind={kind}
      aria-hidden="true"
      style={{
        width,
        height,
        fontSize: Math.round(Math.min(width, height) * 0.35),
        background: `linear-gradient(160deg, hsl(${hue} 38% 26%), hsl(${(hue + 50) % 360} 42% 14%))`,
      }}
    >
      <span className="fallback-art__initials">{initialsFrom(label)}</span>
      <span className="fallback-art__glyph">
        {kind === 'person' ? <PersonGlyph /> : <FilmGlyph />}
      </span>
    </span>
  );
}
