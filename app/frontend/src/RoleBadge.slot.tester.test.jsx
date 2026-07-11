/**
 * IMDB-17 tester acceptance — the zero-layout-jump discipline (DES-1 addendum
 * "Fixed slot"). jsdom does not compute layout from stylesheets, so this is
 * asserted at the two levels that together pin the behavior:
 *
 *   1. component level: the outer slot element keeps the SAME single class
 *      (`role-badge`, no state-modifier) across every state flip — only
 *      `data-*` and the inner pill change, so one CSS rule owns the width in
 *      all states;
 *   2. stylesheet level: that one rule declares the constant 104px width, the
 *      pill ellipsizes past ~11ch, and the ≤720px media query removes the slot
 *      (the menu section is the sole surface there).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import RoleBadge from './RoleBadge.jsx';
import { ingestResponse, resetGovernanceRoles } from './graphql/rolesStore.js';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'styles.css'),
  'utf8',
);

function ingest(map) {
  act(() => ingestResponse(new Headers(map)));
}

beforeEach(() => resetGovernanceRoles());
afterEach(() => resetGovernanceRoles());

describe('IMDB-17: fixed slot — state flips never change the slot element or its class', () => {
  it('the outer slot keeps exactly class "role-badge" across unknown → roles → none → roles', () => {
    const { container } = render(<RoleBadge />);

    const classAt = () => container.querySelector('[data-state]').className;
    expect(classAt()).toBe('role-badge'); // unknown

    ingest({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '8' });
    expect(classAt()).toBe('role-badge'); // present — no width-affecting modifier

    ingest({ 'X-Imdb-Policy-Revision': '9' });
    expect(classAt()).toBe('role-badge'); // none — same class, same rule, same width

    ingest({ 'X-Imdb-Roles': 'content-moderator,analyst', 'X-Imdb-Policy-Revision': '10' });
    expect(classAt()).toBe('role-badge'); // multi-role — still the same slot
  });

  it('the slot is rendered in ALL states (present even while Unknown — never mounts late)', () => {
    const { container } = render(<RoleBadge />);
    expect(container.querySelector('.role-badge')).toBeInTheDocument(); // before any response

    ingest({ 'X-Imdb-Policy-Revision': '8' });
    expect(container.querySelector('.role-badge')).toBeInTheDocument();
  });
});

describe('IMDB-17: stylesheet pins the slot geometry (DES-1 addendum)', () => {
  /** The body of the first `.role-badge { … }` rule outside any media query. */
  function ruleBody(selector) {
    const match = css.match(new RegExp(`(?:^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
  }

  it('.role-badge is a constant 104px-wide slot', () => {
    expect(ruleBody('.role-badge')).toMatch(/width:\s*104px/);
  });

  it('the pill ellipsizes past ~11ch instead of growing the slot', () => {
    const pill = ruleBody('.role-badge__pill');
    expect(pill).toMatch(/max-width:\s*11ch/);
    expect(pill).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('the dashed no-roles variant restyles the pill only — it declares no width', () => {
    const none = ruleBody('.role-badge__pill--none');
    expect(none).toMatch(/border-style:\s*dashed/);
    expect(none).not.toMatch(/(?<!max-)width/);
  });

  it('below 720px the slot is not rendered (menu section is the sole surface)', () => {
    // The stylesheet has several ≤720px blocks; one of them must hide the slot.
    const blocks = [...css.matchAll(/@media\s*\(max-width:\s*720px\)\s*\{([\s\S]*?)\n\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    expect(
      blocks.some((m) => /\.role-badge\s*\{[^}]*display:\s*none/.test(m[1])),
    ).toBe(true);
  });
});
