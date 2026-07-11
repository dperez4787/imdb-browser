// The Marquee wordmark: uppercase text + the amber dot (DES-1's shared visual
// language). Pure presentation; used by the curtain, the sign-in card, and the
// TopBar. Below 720px the TopBar collapses it to just the dot (CSS).
export default function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark__text">Marquee</span>
      <span className="wordmark__dot" aria-hidden="true" />
    </span>
  );
}
