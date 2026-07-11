import { Link, useLocation } from 'react-router';
import Omnibox from './search/Omnibox.jsx';
import UserMenu from './UserMenu.jsx';
import Wordmark from './Wordmark.jsx';

// The signed-in chrome's top bar (DES-1): wordmark left (navigates to `/`),
// the compact omnibox center (DES-2 — hidden on `/`, where the hero omnibox
// is the same component in its large variant), identity/sign-out right. The
// chat toggle (DES-7) mounts here with IMDB-11. Tab order per the design:
// wordmark → omnibox → avatar.
export default function TopBar() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';

  return (
    <header className="topbar">
      <Link className="topbar__home" to="/" aria-label="Marquee — home">
        <Wordmark />
      </Link>
      <div className="topbar__omnibox-slot" data-slot="omnibox">
        {!onHome && <Omnibox variant="compact" />}
      </div>
      <div className="topbar__actions">
        <UserMenu />
      </div>
    </header>
  );
}
