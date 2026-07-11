---
id: IMDB-12
title: Deploy pipeline — Firebase Hosting + Cloud Run via OIDC/WIF
status: done
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
- **tester** — verdict: all statically/locally verifiable criteria PASS; live-run criteria (AC 2–3) NOT VERIFIED, deferred to first merge per user directive 2026-07-11. Status → done, PR #18 taken out of draft. Per-criterion:
  - AC 1 (provisioning settled + executed) — **pass**. Beyond the ticket log, independently re-confirmed read-only against GCP/GitHub: WIF provider `github-provider-imdbbrowser` ACTIVE with condition `assertion.repository == 'dperez4787/imdb-browser'`; runtime SA `imdb-browser-run@…` exists; AR repo `imdb-browser` (Docker, us-central1) exists (empty — consistent with no run yet); secret `ANTHROPIC_API_KEY` exists; Hosting site `dfp-imdb-browser` exists alongside the default site; `gh secret list` shows exactly `WIF_PROVIDER` and `DEPLOY_SA` (2026-07-11).
  - AC 2 (push to main → one run deploying SPA + SHA-tagged chat image) — **not verified**: the workflow triggers only on push to `main` and no deploy was performed (none permitted). Everything short of running it verified: `actionlint` 1.7.12 clean (exit 0); trigger is `push: branches: [main]` only; every literal matches the verified provisioning (project, region, AR path `imdb-browser/chat`, service `imdb-browser-chat`, runtime SA, secret name, site). Verifiable on first merge from Actions logs + live URLs; the main session will monitor that run.
  - AC 3 (SPA serves on Hosting URL; chat responds with the secret injected) — **not verified** (live-only, same deferral). Precursors verified: key reaches Cloud Run only via `--set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest`; no key material anywhere in the repo or workflow.
  - AC 4 (OIDC/WIF, `id-token: write`, no SA key JSON) — **pass**. Both jobs declare per-job `contents: read` + `id-token: write`; auth is `google-github-actions/auth@v2` with `secrets.WIF_PROVIDER`/`secrets.DEPLOY_SA`, no `credentials_json` input anywhere; repo grep found no key material. Caveat stated honestly: GitHub secret *values* are unreadable by design — but the only two secrets are the provider resource name and SA email per the provisioning log, and the workflow has no input that could consume a key JSON.
  - AC 5 (never `latest`; pinned firebase-tools; firebase.json at repo root) — **pass**. Image tag is `${{ github.sha }}` only (the sole `:latest` is the Secret Manager version alias, correct usage); `firebase-tools` pinned 13.29.2 (identical to linear-example's pin); `firebase.json` at repo root, deploy step runs from root against the named target `hosting:dfp-imdb-browser` only.
  - Reproduced the developer's local validations independently: `docker build -f app/chat/Dockerfile …` (exact workflow command) succeeds; credential-less smoke run honors `$PORT` (9187) and `/health` returns 200 `{"status":"ok"}` with the no-key warning logged; `npm ci && VITE_CHAT_URL=<placeholder> npm run build` in `app/frontend` inlines the placeholder exactly once and compiles the `localhost:8080` fallback away (0 occurrences in dist); `firebase target` (pinned 13.29.2) resolves `.firebaserc` → `dfp-imdb-browser (dfp-imdb-browser)` and `hosting:sites:list` shows the site live. URL-handoff step sanity: `gcloud run services describe --format 'value(status.url)'` proven against the existing `linear-example-backend` service to emit exactly one URL; fail-fast `test -n` guard present; `steps.chat-url.outputs.url` → `VITE_CHAT_URL` plumbing correct (same job, matching id/output).
  - Suites green on this branch: frontend 230 passed / 13 skipped; chat 45 passed. Added `.github/workflows/deploy.test.js` (node --test, dependency-free) pinning the workflow's acceptance invariants + provisioning literals — 10/10 pass.
  - Convention vs linear-example `deploy.yml`: conforms on every checked point; three departures all justified in comments (frontend `needs: chat` + URL resolution, named hosting target, auth-before-build). Observation, not a defect: linear-example passes `--min-instances=1 --cpu-boost`; this workflow omits both, so the chat service scales to zero and cold-starts. Doc nit: `docs/architecture.md` line ~446's command comment says authorize `imdb-browser.web.app` — the correct domain (per line 397 and the live site) is `dfp-imdb-browser.web.app`. That user console step gates prod sign-in only, not the deploy.
