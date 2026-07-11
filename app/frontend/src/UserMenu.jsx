import { useEffect, useRef, useState } from 'react';

import { useAuth } from './AuthContext.jsx';
import Monogram from './Monogram.jsx';
import RoleBadge from './RoleBadge.jsx';
import { resetGovernanceRoles, useGovernanceRoles } from './graphql/rolesStore.js';

// The signed-in identity + sign-out affordance (DES-1). An avatar button (the
// user's Google photo, or a Monogram when the photo is missing or fails to
// load — no layout shift) opening a menu with display name, email (muted), and
// Sign out. Keyboard: opens on Enter/Space (native button), focus moves into
// the menu, Tab is trapped while open, Esc closes and returns focus to the
// avatar button.
//
// IMDB-17 (DES-1 addendum): the trigger also wears the governance RoleBadge
// (left of the avatar, one click target, no new tab stop) and the menu gains a
// static "Data roles" section explaining who the graph thinks you are. The
// trigger's accessible name carries the badge state (no aria-live, per the
// addendum's no-announcement stance).
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const { roles, revision } = useGovernanceRoles();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const signOutRef = useRef(null);

  const label = user.displayName ?? user.email ?? 'Signed in';

  // The trigger's accessible name extends with the badge state (DES-1 addendum):
  // "<name> — data roles: …" / "<name> — no data role" / just the name while
  // Unknown. Silent — no aria-live; a screen-reader user reads the current
  // state off the trigger or in the menu.
  let roleSuffix = '';
  if (Array.isArray(roles)) {
    roleSuffix = roles.length === 0 ? ' — no data role' : ` — data roles: ${roles.join(', ')}`;
  }

  // Sign-out returns the session to Unknown: the shell (and this menu) unmounts,
  // so a fresh sign-in starts blank rather than flashing the prior user's roles.
  useEffect(() => () => resetGovernanceRoles(), []);

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
        aria-label={`Account: ${label}${roleSuffix}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <RoleBadge />
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
          {/* Data roles — static, non-focusable text (the badge's explainer and
              the sole role surface below 720px). Not a menu item: skipped by
              menu keyboard nav, Sign out stays the only action. */}
          <div className="user-menu__roles" data-roles={Array.isArray(roles) ? roles.join(',') : undefined}>
            <span className="user-menu__roles-label">Data roles</span>
            {roles == null ? (
              <span className="user-menu__roles-value">—</span>
            ) : roles.length === 0 ? (
              <>
                <span className="user-menu__roles-value">No data role</span>
                <span className="user-menu__roles-note">
                  Governed fields are redacted for you. A graph admin can grant a role — it takes
                  effect live, no reload.
                </span>
              </>
            ) : (
              <span className="user-menu__roles-value">{roles.join(', ')}</span>
            )}
            {revision != null && (
              <span className="user-menu__roles-rev">policy rev {revision}</span>
            )}
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
