import UserMenu from './UserMenu.jsx';
import Wordmark from './Wordmark.jsx';

// The signed-in chrome's top bar (DES-1): wordmark left (navigates to `/`),
// the omnibox slot center (DES-2 owns and fills it — IMDB-5), identity/sign-out
// right. The chat toggle (DES-7) mounts here with IMDB-11. Tab order per the
// design: wordmark → (omnibox) → avatar.
export default function TopBar() {
  return (
    <header className="topbar">
      <a className="topbar__home" href="/" aria-label="Marquee — home">
        <Wordmark />
      </a>
      <div className="topbar__omnibox-slot" data-slot="omnibox" />
      <div className="topbar__actions">
        <UserMenu />
      </div>
    </header>
  );
}
