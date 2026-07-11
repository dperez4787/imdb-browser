/**
 * RoleBadge (IMDB-17, DES-1 addendum): the four badge states and a live flip.
 * The badge reads the module store, so tests drive it by ingesting router
 * response headers exactly as client.js does — no request, no mock transport.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import RoleBadge from './RoleBadge.jsx';
import { ingestResponse, resetGovernanceRoles } from './graphql/rolesStore.js';

function ingest(map) {
  act(() => ingestResponse(new Headers(map)));
}

beforeEach(() => resetGovernanceRoles());
afterEach(() => resetGovernanceRoles());

describe('RoleBadge', () => {
  it('Unknown: an empty slot, no pill, no data-roles (a claim before the first response would be a guess)', () => {
    const { container } = render(<RoleBadge />);
    const badge = container.querySelector('.role-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-state', 'unknown');
    expect(badge).not.toHaveAttribute('data-roles');
    expect(badge.querySelector('.role-badge__pill')).toBeNull();
  });

  it('No roles: dashed pill, exact copy "no data role", data-roles=""', () => {
    const { container } = render(<RoleBadge />);
    ingest({ 'X-Imdb-Policy-Revision': '12' }); // header absent → no roles

    const badge = container.querySelector('.role-badge');
    expect(badge).toHaveAttribute('data-state', 'none');
    expect(badge).toHaveAttribute('data-roles', '');
    const pill = badge.querySelector('.role-badge__pill');
    expect(pill).toHaveClass('role-badge__pill--none'); // dashed variant
    expect(pill).toHaveTextContent('no data role');
  });

  it('One role: solid pill with the role name verbatim', () => {
    const { container } = render(<RoleBadge />);
    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' });

    const badge = container.querySelector('.role-badge');
    expect(badge).toHaveAttribute('data-state', 'present');
    expect(badge).toHaveAttribute('data-roles', 'analyst');
    const pill = badge.querySelector('.role-badge__pill');
    expect(pill).not.toHaveClass('role-badge__pill--none');
    expect(pill).toHaveTextContent('analyst');
  });

  it('Multiple roles: "first +N" in the pill, full list in data-roles', () => {
    const { container } = render(<RoleBadge />);
    ingest({ 'X-Imdb-Roles': 'analyst,public,admin', 'X-Imdb-Policy-Revision': '12' });

    const badge = container.querySelector('.role-badge');
    expect(badge).toHaveAttribute('data-roles', 'analyst,public,admin');
    expect(badge.querySelector('.role-badge__pill')).toHaveTextContent('analyst +2');
  });

  it('Live flip: restyles in place on the next response (present → no roles)', () => {
    const { container } = render(<RoleBadge />);
    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' });
    expect(container.querySelector('.role-badge')).toHaveAttribute('data-state', 'present');

    ingest({ 'X-Imdb-Policy-Revision': '13' }); // re-denied
    const badge = container.querySelector('.role-badge');
    expect(badge).toHaveAttribute('data-state', 'none');
    expect(badge.querySelector('.role-badge__pill')).toHaveTextContent('no data role');
  });
});
