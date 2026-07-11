import ChatToggle from './chat/ChatToggle.jsx';
import UserMenu from './UserMenu.jsx';
import Wordmark from './Wordmark.jsx';

// The signed-in chrome's top bar (DES-1): wordmark left (navigates to `/`),
// the omnibox slot center (DES-2 owns and fills it — IMDB-5), then the
// concierge toggle (DES-7 / IMDB-11) and identity/sign-out on the right.
// Tab order per the design: wordmark → (omnibox) → chat toggle → avatar.
export default function TopBar() {
  return (
    <header className="topbar">
      <a className="topbar__home" href="/" aria-label="Marquee — home">
        <Wordmark />
      </a>
      <div className="topbar__omnibox-slot" data-slot="omnibox" />
      <div className="topbar__actions">
        <ChatToggle />
        <UserMenu />
      </div>
    </header>
  );
}
