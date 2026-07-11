// Initials disc with a deterministic hue derived from a string (DES-1 shared
// visual language; DES-6 reuses it for people). Deterministic so the same
// entity always looks the same. Same footprint as an avatar image, so swapping
// one for the other causes no layout shift.

/** FNV-1a over the seed string, folded to a hue in [0, 360). */
export function hueFromString(seed) {
  let hash = 0x811c9dc5;
  for (const ch of String(seed)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** Up to two initials from a display string ("Danny Perez" → "DP"). */
export function initialsFrom(text) {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
    .toUpperCase();
  return initials || '?';
}

export default function Monogram({ text, seed, size = 32 }) {
  const hue = hueFromString(seed ?? text ?? '');
  return (
    <span
      className="monogram"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(135deg, hsl(${hue} 35% 28%), hsl(${(hue + 40) % 360} 35% 18%))`,
      }}
    >
      {initialsFrom(text)}
    </span>
  );
}
