// MCP wiring: spawns the mcp-graphql server (v2.x, stdio) per request, pointed
// at the cosmo router with the requesting user's forwarded Firebase ID token as
// the router credential — the bot's data access is exactly the user's, no
// service credential (docs/architecture.md, "Chat backend API contract").
//
// mcp-graphql 2.0.4 is configured via environment variables (verified in its
// README/dist): ENDPOINT, HEADERS (JSON string), ALLOW_MUTATIONS (default
// false — mutations stay disabled; the graph has none), NAME. Its two tools are
// `introspect-schema` and `query-graphql`.
import { createRequire } from 'node:module'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { ROUTER_GRAPHQL_URL } from './config.js'

const require = createRequire(import.meta.url)

// mcp-graphql publishes only dist/ and declares no exports map, so resolve the
// package root via its package.json and point node at the built entry (the same
// file its `bin` points at).
function mcpGraphqlEntry() {
  const pkg = require.resolve('mcp-graphql/package.json')
  return path.join(path.dirname(pkg), 'dist', 'index.js')
}

// Pure config builder, exported for tests: the child process environment that
// carries the endpoint and the user's forwarded token.
//
// GOVERNANCE GUARANTEE — DO NOT CHANGE THE Authorization HEADER TO A SERVICE
// CREDENTIAL. The router enforces field-level policy against the *caller's*
// identity, so the MCP child MUST authenticate to the router as the REQUESTING
// USER: HEADERS carries `Bearer <that user's Firebase ID token>`, the exact
// credential the browser uses. The bot therefore sees precisely what the user is
// allowed to see and can never become a bypass channel around governance. If a
// service/router identity were substituted here, the assistant would read
// governed fields the user is denied — defeating the whole point of IMDB-16. A
// regression test (governance.test.js) asserts this header is the user's token
// and fails if it ever becomes a static or service identity; keep it green.
export function buildMcpEnv({ idToken, endpoint = ROUTER_GRAPHQL_URL }) {
  return {
    ENDPOINT: endpoint,
    HEADERS: JSON.stringify({ Authorization: `Bearer ${idToken}` }),
    ALLOW_MUTATIONS: 'false',
    NAME: 'imdb-graphql',
  }
}

// Spawns one mcp-graphql child for one chat request and returns a session:
//   tools     — the server's tools in Anthropic tool-definition shape
//   callTool  — executes a tool, returns the result flattened to a string
//   close     — tears the child down (always call, in a finally)
export async function createMcpSession({ idToken, endpoint = ROUTER_GRAPHQL_URL }) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpGraphqlEntry()],
    env: buildMcpEnv({ idToken, endpoint }),
    // Keep the child's stderr out of our stdout-based logs; mcp-graphql logs
    // its startup banner there. Never log HEADERS/tokens.
    stderr: 'ignore',
  })

  const client = new Client({ name: 'imdb-browser-chat', version: '0.1.0' })
  await client.connect(transport)

  const { tools } = await client.listTools()

  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema,
    })),

    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args ?? {} })
      const text = (result.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return { text, isError: result.isError === true }
    },

    async close() {
      await client.close()
    },
  }
}
