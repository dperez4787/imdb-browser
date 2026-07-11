import { Link, useInRouterContext, useLocation } from 'react-router';
import ChatToggle from './chat/ChatToggle.jsx';
import Omnibox from './search/Omnibox.jsx';
import UserMenu from './UserMenu.jsx';
import Wordmark from './Wordmark.jsx';

// The signed-in chrome's top bar (DES-1): wordmark left (navigates to `/`),
// the compact omnibox center (DES-2 — hidden on `/`, where the hero omnibox
// is the same component in its large variant), then the concierge toggle
// (DES-7 / IMDB-11) and identity/sign-out on the right. Tab order per the
// design: wordmark → omnibox → chat toggle → avatar.
//
// Router-safety: the omnibox slot and the Link wordmark depend on routing
// context that main.jsx always provides in production. TopBar is also chrome
// that chat tests mount without a Router, so the location-dependent pieces
// live in a child rendered only inside a router (useInRouterContext is
// react-router's public API for exactly this); outside one, TopBar degrades
// to a plain anchor and an empty slot — same markup TopBar had before IMDB-5.

function LocationAwareOmniboxSlot() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  return (
    <div className="topbar__omnibox-slot" data-slot="omnibox">
      {!onHome && <Omnibox variant="compact" />}
    </div>
  );
}

export default function TopBar() {
  const inRouter = useInRouterContext();

  return (
    <header className="topbar">
      {inRouter ? (
        <Link className="topbar__home" to="/" aria-label="Marquee — home">
          <Wordmark />
        </Link>
      ) : (
        <a className="topbar__home" href="/" aria-label="Marquee — home">
          <Wordmark />
        </a>
      )}
      {inRouter ? (
        <LocationAwareOmniboxSlot />
      ) : (
        <div className="topbar__omnibox-slot" data-slot="omnibox" />
      )}
      <div className="topbar__actions">
        <ChatToggle />
        <UserMenu />
      </div>
    </header>
  );
}
