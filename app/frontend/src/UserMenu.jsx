import { useEffect, useRef, useState } from 'react';

import { useAuth } from './AuthContext.jsx';
import Monogram from './Monogram.jsx';

// The signed-in identity + sign-out affordance (DES-1). An avatar button (the
// user's Google photo, or a Monogram when the photo is missing or fails to
// load — no layout shift) opening a menu with display name, email (muted), and
// Sign out. Keyboard: opens on Enter/Space (native button), focus moves into
// the menu, Tab is trapped while open, Esc closes and returns focus to the
// avatar button.
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const signOutRef = useRef(null);

  const label = user.displayName ?? user.email ?? 'Signed in';

  // Close on click/tap outside.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Focus the menu's actionable item when it opens.
  useEffect(() => {
    if (open) {
      signOutRef.current?.focus();
    }
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeAndRefocus();
    } else if (event.key === 'Tab') {
      // Focus trap: Sign out is the menu's only focusable item.
      event.preventDefault();
      signOutRef.current?.focus();
    }
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className="user-menu__button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${label}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {user.photoURL && !avatarFailed ? (
          <img
            className="user-menu__avatar"
            src={user.photoURL}
            alt=""
            width="32"
            height="32"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <Monogram text={label} seed={user.uid ?? label} size={32} />
        )}
      </button>
      {open && (
        // The keydown handler implements the DES-1 menu keyboard contract
        // (Esc close + focus trap) for the focus already placed inside.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div className="user-menu__menu" role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
          <div className="user-menu__identity">
            {user.displayName && (
              <span className="user-menu__name">{user.displayName}</span>
            )}
            {user.email && <span className="user-menu__email">{user.email}</span>}
          </div>
          <button
            ref={signOutRef}
            className="user-menu__signout"
            type="button"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
