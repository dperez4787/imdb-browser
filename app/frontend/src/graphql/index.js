/**
 * GraphQL client boundary (stub).
 *
 * Per CLAUDE.md, this directory is the SPA's ONE sanctioned GraphQL surface:
 * all data comes from the cosmo federation router through this module. No
 * `fetch()` and no inline query strings inside components — ever.
 *
 * Intentionally empty in IMDB-1. Client library choice, caching, auth-header
 * attachment, and error normalization are OPEN in docs/architecture.md
 * ("GraphQL client layer") and land with IMDB-4.
 */
export {};
