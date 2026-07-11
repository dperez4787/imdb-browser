---
id: IMDB-12
title: Deploy pipeline — Firebase Hosting + Cloud Run via OIDC/WIF
status: in-review
owner: product-owner
depends-on: [IMDB-1, IMDB-10]
branch: "imdb-12-deploy-pipeline"
pr: "https://github.com/dperez4787/imdb-browser/pull/18"
---

## Description

Continuous deployment mirroring linear-example's `deploy.yml` and `firebase.json`, per
the brief: on push to `main`, GitHub Actions deploys the SPA to Firebase Hosting and
the chat backend to Cloud Run. Auth is OIDC / Workload Identity Federation
(`id-token: write`) — no service-account keys anywhere. The backend image is built on
the runner from IMDB-10's Dockerfile, pushed to Artifact Registry, **tagged by commit
SHA, never `latest`**; `ANTHROPIC_API_KEY` reaches Cloud Run from Secret Manager.
`firebase-tools` is pinned to an exact version and `firebase deploy` runs from the repo
root where `firebase.json` lives. Blocked on the OPEN "GCP provisioning for this repo"
section of `docs/architecture.md` (project/region, Artifact Registry repo, WIF provider
+ deploy SA, Firebase site, Secret Manager entries). **GCP provisioning and all IAM
changes are executed by the user, not agents** — this ticket includes producing the
exact provisioning steps/values for the user to run, then wiring the workflow to them.

## Acceptance criteria

- The architecture doc's provisioning section is settled and the user has run the
  listed IAM/provisioning steps (logged on this ticket).
- A push to `main` triggers one workflow run that (a) builds and deploys the SPA to
  the Firebase Hosting site, and (b) builds the chat image, pushes it to Artifact
  Registry tagged with the commit SHA, and deploys that tag to Cloud Run — both
  verifiable from the run logs and the live URLs.
- The deployed SPA serves over the Hosting URL and the deployed chat service responds
  on Cloud Run with `ANTHROPIC_API_KEY` sourced from Secret Manager (never from the
  repo or workflow file).
- The workflow authenticates via OIDC/WIF with `id-token: write`; the repo and its
  GitHub secrets contain no service-account key JSON.
- No image is tagged or deployed as `latest`; `firebase-tools` is version-pinned;
  `firebase.json` lives at the repo root.

## Files expected to change

- .github/workflows/deploy.yml
- firebase.json, .firebaserc
- docs/architecture.md (provisioning values, recorded by the architect)

## Log

- **product-owner** — filed. `needs-architecture`: blocked on the OPEN "GCP
  provisioning for this repo" section; the actual provisioning/IAM commands are
  user-run by policy. Needs IMDB-1 (something to host) and IMDB-10 (an image to ship).
- **architect** — architecture settled; status → `backlog` (deliberately NOT
  ready-for-dev). The "GCP provisioning for this repo" section of
  `docs/architecture.md` now lists every resource and the exact user-run commands:
  same project as the rest of the stack (`project-d60a83c1-2c60-4d51-ad0`,
  us-central1 — required by the router-auth decision, since the router's JWT audience
  is that Firebase project), new WIF provider `github-provider-imdbbrowser` in the
  existing `github-pool`, deploy SA `imdb-browser-deploy` (4 roles + WIF binding),
  runtime SA `imdb-browser-run` (secret-scoped accessor only), AR repo
  `imdb-browser`, secret `ANTHROPIC_API_KEY`, second Firebase Hosting site
  `imdb-browser` + new Web App + Auth authorized domain, GitHub secrets
  `WIF_PROVIDER`/`DEPLOY_SA`; Cloud Run service `imdb-browser-chat` is CI-created,
  never hand-provisioned. Why still blocked: AC 1 requires the user to have RUN those
  steps (IAM is user-run by policy) and depends-on IMDB-1/IMDB-10 are unmerged — flip
  to `ready-for-dev` once the user logs provisioning complete on this ticket and the
  dependencies merge. Developer note for then: use a named hosting target
  (`hosting:imdb-browser`) since the project's default site belongs to
  linear-example; mirror linear-example `deploy.yml` otherwise (id-token: write,
  SHA-tagged image, pinned firebase-tools, deploy from repo root).
- **main session** — GCP provisioning executed by the user and verified (2026-07-11): WIF provider ACTIVE, deploy/runtime SAs + roles, AR repo, ANTHROPIC_API_KEY v1, GitHub secrets re-set literal. Hosting site is `dfp-imdb-browser` (the planned id was globally reserved) — prod URL will be https://dfp-imdb-browser.web.app; deploy must target that site. Auth authorized-domain console step still pending, does not block the workflow build. Status → ready-for-dev.
- **developer** — claimed. Branch `imdb-12-deploy-pipeline`. Scope: `.github/workflows/deploy.yml`, `firebase.json`, `.firebaserc` per the architecture doc's workflow-shape paragraph (hosting site `dfp-imdb-browser` via named target; chat image SHA-tagged to AR repo `imdb-browser`; OIDC/WIF only).
- **developer** — implemented; status → in-review, PR #18 (draft). Files: `.github/workflows/deploy.yml`, `firebase.json`, `.firebaserc`. Workflow mirrors linear-example's deploy.yml (per-job `id-token: write`, SHA-tagged image never `latest`, `firebase-tools` pinned to 13.29.2, deploy from repo root) with two commented departures: (1) `frontend` job `needs: chat` and resolves the live Cloud Run URL via `gcloud run services describe` to feed `VITE_CHAT_URL` into the Vite build — deterministic even on the first run, since the chat job creates the service first; (2) named hosting target `dfp-imdb-browser` because the project's default site serves linear-example. Verified locally: actionlint clean; `docker build app/chat` succeeds and the image smoke-runs (listens on `$PORT`, serves HTTP, starts without `ANTHROPIC_API_KEY`); frontend build with a placeholder `VITE_CHAT_URL` succeeds and the URL is inlined into the bundle (localhost fallback gone); `firebase target` resolves the `.firebaserc` mapping and `hosting:sites:list` confirms site `dfp-imdb-browser` exists apart from the default site. NOT verified — honestly: the workflow itself never ran (it triggers only on push to `main`; hosting has no dry-run; no deploy of any kind was performed from this branch), so AC 2–3 (live run, live URLs, secret injection on Cloud Run) are verifiable only on first merge, from the Actions logs + `https://dfp-imdb-browser.web.app` + the chat service URL. Outstanding user step, deploy-unaffected: add `dfp-imdb-browser.web.app` to Firebase Auth authorized domains, else prod sign-in fails.
