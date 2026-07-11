import { useGovernanceRoles } from './graphql/rolesStore.js';

// The governance role badge (IMDB-17, DES-1 addendum "governance role badge").
// A fixed-width 104px slot rendered INSIDE the UserMenu trigger, 8px left of the
// avatar, so state changes never shift the 56px TopBar (the zero-layout-jump
// rule applied to chrome). The slot is always present; only the pill inside it
// changes, keeping the slot width and every neighbor's position identical across
// all four states and any live flip.
//
// The pill is presentation only — the trigger's aria-label (owned by UserMenu)
// carries the state for assistive tech, so the badge is aria-hidden and adds no
// tab stop and no tooltip (its full explanation is one click away in the menu).
// `data-roles` exposes the state to tests: "" for no-roles, the comma-joined
// list otherwise.
export default function RoleBadge() {
  const { roles } = useGovernanceRoles();

  // Unknown — no router response observed yet this session. Empty slot; showing
  // "no data role" before we know would be a guess.
  if (roles == null) {
    return <span className="role-badge" data-state="unknown" aria-hidden="true" />;
  }

  // No roles — a response arrived with X-Imdb-Roles absent. Dashed, muted,
  // exact copy "no data role" (never an invented role name, no lock glyph).
  if (roles.length === 0) {
    return (
      <span className="role-badge" data-state="none" data-roles="" aria-hidden="true">
        <span className="role-badge__pill role-badge__pill--none">no data role</span>
      </span>
    );
  }

  // Roles present — solid pill. One role verbatim; two+ collapse to "first +N",
  // the full list living in the menu. CSS renders small-caps; the string is
  // never rewritten.
  const text = roles.length === 1 ? roles[0] : `${roles[0]} +${roles.length - 1}`;
  return (
    <span className="role-badge" data-state="present" data-roles={roles.join(',')} aria-hidden="true">
      <span className="role-badge__pill">{text}</span>
    </span>
  );
}
