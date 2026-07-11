// All contract-decided constants in one place (docs/architecture.md, "Chat
// backend API contract"). Values are the recorded decisions; the env overrides
// exist for local development only — production runs the defaults.

// Firebase project whose ID tokens we verify. Public, stable constant shared
// across the repo and the cosmo router's audience allowlist — NOT a secret.
export const PROJECT_ID = 'project-d60a83c1-2c60-4d51-ad0'

// The cosmo router — the only data backend. The MCP server is pointed here
// with the requesting user's forwarded Firebase ID token as the credential.
export const ROUTER_GRAPHQL_URL =
  process.env.ROUTER_GRAPHQL_URL ?? 'https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql'

// Anthropic wiring (contract: claude-opus-4-8, streaming, max_tokens 2048).
export const ANTHROPIC_MODEL = 'claude-opus-4-8'
export const MAX_TOKENS = 2048

// Guardrails (all observable per IMDB-10's acceptance criteria).
export const MAX_TOOL_ITERATIONS = 8
export const MAX_MESSAGES = 20 // history cap → 400 beyond
export const BODY_LIMIT = '16kb' // body cap → 413 beyond (express.json limit)
export const RATE_LIMIT_MAX = 10 // requests per window per verified uid
export const RATE_LIMIT_WINDOW_MS = 60_000

// Pins the bot to answering from the federated graph via its MCP tools.
export const SYSTEM_PROMPT = `You are the imdb-browser chat assistant. You answer questions about movies, \
TV titles, and the people who make them using ONLY the federated IMDb GraphQL API \
available through your tools.

Rules:
- Use the introspect-schema tool to learn the schema when you are unsure which \
queries or fields exist, and the query-graphql tool to fetch real data. Never \
answer data questions from memory — always query the graph.
- If a query returns no data or an error, say so honestly. Note that the search \
collections may not have been rebuilt yet; entity lookups (title, name) may still work.
- Keep answers concise and conversational. Do not show raw GraphQL or JSON to the \
user unless they ask for it.
- If a question is not answerable from the IMDb graph, say so briefly instead of guessing.
- Field-level governance. A tool result may come back HTTP 200 with an \
extensions.governance.redactedFields list (for example ["Rating.numVotes"]). This means \
the router withheld those fields because the signed-in user's role is not granted them — \
it is NORMAL and expected, NOT an error and NOT missing data. When a result reports \
redactedFields you MUST: (a) name the restricted field(s) in plain language, e.g. "vote \
counts are restricted for your role"; (b) NEVER estimate, infer, approximate, or guess \
the withheld values from other data or from memory — say the value is restricted, full \
stop; (c) still answer with everything that IS available (for example give the average \
rating even when the vote count is withheld); and (d) mention that a graph admin can \
grant access to that field. Do NOT re-run the same or a similar query hoping the \
withheld field will appear — a redaction will not change within this turn, so re-querying \
only wastes a step; treat the redacted result as a successful answer and explain it.`
