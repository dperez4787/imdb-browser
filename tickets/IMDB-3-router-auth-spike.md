---
id: IMDB-3
title: Architecture spike — how the browser authenticates to the cosmo router
status: in-review
owner: product-owner
depends-on: []
branch: "architecture-round-1"
pr: "https://github.com/dperez4787/imdb-browser/pull/3"
---

## Description

The cosmo router is not public (live checks return 401/403 anonymously), and the brief
says how the SPA authenticates to it must be settled **with evidence from the
cosmo-router repo, not by assumption**, before any data-fetching ticket is
implementable. This spike's deliverable is the architect replacing the OPEN "Router
authentication from the browser" section of `docs/architecture.md` with a decision and
its one-sentence why. Candidates named by the brief: the router validates Firebase ID
tokens (JWT config), a Firebase Hosting rewrite/proxy, or a thin authenticated proxy on
Cloud Run. Any router-side or GCP-side configuration change is coordinated with the
user (the user runs IAM/infra changes). This blocks IMDB-4 and, transitively, every
view that fetches data.

## Acceptance criteria

- The OPEN "Router authentication from the browser" block in `docs/architecture.md` is
  replaced by a decision, its one-sentence rationale, and the evidence consulted
  (cosmo-router repo config, live router behavior).
- The decision states concretely where the credential is attached (which header/token,
  produced by what) so IMDB-4 can implement it without further questions.
- The decision is demonstrated end-to-end once: a request authenticated per the
  decision receives a successful GraphQL response from the live router, and an
  unauthenticated request is still rejected (documented in the Log or the doc).
- Any required router-side/infra change is either already applied (user-run,
  coordinated) or explicitly listed as a prerequisite with owner = user.

## Files expected to change

- docs/architecture.md

## Log

- **product-owner** — filed. `needs-architecture` by definition — this ticket *is* the
  resolution of the OPEN section. No code in this repo changes; the deliverable is the
  recorded, evidenced decision.
- **architect** — resolved. Decision recorded in `docs/architecture.md` § "Router
  authentication from the browser": the SPA sends the user's Firebase ID token as
  `Authorization: Bearer` directly to `POST https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql`;
  the router (deployed `--allow-unauthenticated`, per its `deploy.yml`) validates it
  via stock JWKS config (`cosmo-router/config/config.yaml`, Firebase securetoken JWKS,
  audience `project-d60a83c1-2c60-4d51-ad0`). Binding consequence: this repo's SPA
  must use Firebase project `project-d60a83c1-2c60-4d51-ad0`. No cosmo-router change,
  no proxy. Evidence logged in the doc: anonymous POST → 401 live; authenticated POST
  (Google OIDC identity token, the config's second JWKS provider) → 200 with data
  live; CORS preflight live allows `Authorization` from any origin. AC 1, 2, 4 met;
  AC 3 met for the Google-OIDC JWT path — the Firebase-ID-token variant is verified
  from router config (JWKS URL + audience) but needs a signed-in browser user to
  exercise live, which is exactly IMDB-4's first acceptance criterion. Status
  `in-review` on PR branch `architecture-round-1`; tester/user can close once IMDB-4
  demos the Firebase-token request end-to-end.
