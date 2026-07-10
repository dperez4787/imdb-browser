/**
 * IMDB-1 tester coverage: mechanically-checkable scaffold criteria from the
 * ticket and CLAUDE.md — ES modules, Node LTS pin, the sanctioned
 * `src/graphql/` boundary, and a network-free scaffold (no fetch()/GraphQL/
 * Firebase anywhere in source).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(srcDir, '..');
const repoRoot = join(frontendDir, '..', '..');

/** Recursively collect source files under a directory. */
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(name) ? [full] : [];
  });
}

/** Strip block and line comments so prohibition notes in docs don't false-positive. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('IMDB-1 scaffold conventions', () => {
  it('uses ES modules ("type": "module" in package.json)', () => {
    const pkg = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf8'));
    expect(pkg.type).toBe('module');
  });

  it('pins a Node LTS version in .nvmrc (repo root or app/frontend)', () => {
    const candidates = [join(repoRoot, '.nvmrc'), join(frontendDir, '.nvmrc')].filter(
      existsSync,
    );
    expect(candidates.length).toBeGreaterThan(0);
    const major = parseInt(readFileSync(candidates[0], 'utf8').trim().replace(/^v/, ''), 10);
    expect(Number.isInteger(major)).toBe(true);
    // LTS lines are even-numbered majors; 20 is the oldest still in LTS support.
    expect(major % 2).toBe(0);
    expect(major).toBeGreaterThanOrEqual(20);
  });

  it('has the sanctioned src/graphql/ boundary directory', () => {
    expect(existsSync(join(srcDir, 'graphql'))).toBe(true);
  });

  it('makes no network requests: no fetch()/XHR/GraphQL/Firebase in source', () => {
    // Exclude this checker itself: its assertion patterns mention the banned strings.
    const self = fileURLToPath(import.meta.url);
    for (const file of sourceFiles(srcDir).filter((f) => f !== self)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code, `${file} must not call fetch()`).not.toMatch(/\bfetch\s*\(/);
      expect(code, `${file} must not use XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(code, `${file} must not contain GraphQL operations`).not.toMatch(
        /\b(?:gql`|graphql\(|query\s+\w+\s*[({]|mutation\s+\w+\s*[({])/,
      );
      expect(code, `${file} must not reference Firebase`).not.toMatch(/firebase/i);
    }
  });
});
