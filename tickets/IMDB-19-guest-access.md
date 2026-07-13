---
id: IMDB-19
title: Guest access — anonymous sign-in for frictionless review
status: done
owner: user (directive relayed by main session)
design: designs/DES-1-marquee-shell-and-sign-in.md
depends-on: [IMDB-2, IMDB-17]
branch: guest-access
pr: ""
---

## Description

The app is a job-application showcase; the Google sign-in wall costs reviewers.
User directive (2026-07-12, explicit "go for it"): add anonymous guest entry while
preserving the field-level-governance capabilities and demo.

Mechanism: Firebase Anonymous Authentication. Guest tokens are real Firebase ID
tokens (same issuer/audience), so the router and chat backend accept them with zero
backend changes; guests have no email, so governance personas can never match them —
they permanently see the redacted/no-data-role state, which IS the reviewer-facing
demo. The provider was enabled in the Firebase project by the main session under
explicit user authorization, and the full path was verified live before any UI was
built (guest token → router 200 + redactedFields → chat streamed a real answer).

## Acceptance criteria

- The sign-in card offers "Continue as guest — no account needed" as a quiet
  secondary action; Google stays the primary (focus, visual weight).
- Guest sign-in lands in the same shell; UserMenu labels the session "Guest /
  browsing without an account"; sign-out works.
- Guests see governed fields redacted (no persona possible) and the "no data role"
  badge — verified live.
- Both sign-in buttons share one in-flight lock; guest failures render the designed
  inline error.
- Chat remains available to guests behind the existing 10 req/min/uid limit.

## Log

- **user** (relayed by main session, 2026-07-12) — directive: remove reviewer
  friction, keep governance demo. Explicit authorization to enable the Anonymous
  provider and build guest entry ("I 100% agree with your suggestion, go for it!").
- **main session** (2026-07-12) — provider enabled (identitytoolkit admin PATCH),
  path verified live end-to-end BEFORE building: guest token accepted by router
  (200, redactedFields intact, roles []) and by the chat backend (streamed real
  answer — which also confirmed the rotated ANTHROPIC_API_KEY is live). UI built
  directly in the main session (sign-in card guest button, auth.js signInAsGuest,
  AuthContext signInGuest, UserMenu guest labeling), caption copy updated
  ("Google sign-in or one-click guest access."), CLAUDE.md + brief amended.
  Direct implementation per the user's demo-speed directives; tester-style
  coverage included in the same change.
