# imdb-browser

A React SPA for rich browsing of IMDb data, backed exclusively by the
[cosmo federation router](https://github.com/dperez4787/cosmo-router) and built by a
team of Claude Code agents driven from local markdown tickets.

**▶ Live app: [Marquee](https://dfp-imdb-browser.web.app)** — browse IMDb like a
lobby, not a spreadsheet. (Google sign-in required.)

**📖 The making-of: [How an agent team built Marquee and its federated IMDb
backend](https://project-d60a83c1-2c60-4d51-ad0.web.app/blog/imdb-federation/)** — the
blog post covering this app, the eight-subgraph federation behind it, and the
field-level governance layer it demos.

- **Start here:** [docs/PROJECT-BRIEF.md](docs/PROJECT-BRIEF.md) — the surrounding
  system, search/facet capabilities, images, auth, chatbot requirements.
- **Decisions:** [docs/architecture.md](docs/architecture.md)
- **Process:** [CLAUDE.md](CLAUDE.md) · tickets in [tickets/](tickets/) · design specs
  in [designs/](designs/)
- **Agents:** [.claude/agents/](.claude/agents/) — product-owner, ui-ux-designer,
  architect, developer, tester

## Live UIs

Every user-facing surface in this system, live:

| Surface | URL |
|---|---|
| **Marquee** — the IMDb browser | https://dfp-imdb-browser.web.app/titles |
| **IMDb Graph Governance** — field-level policy control plane | https://imdb-policy-service-dkuqnmldta-uc.a.run.app/ |
| **linear-example** — records app + the engineering blog | https://project-d60a83c1-2c60-4d51-ad0.web.app/ · [blog](https://project-d60a83c1-2c60-4d51-ad0.web.app/blog) |

