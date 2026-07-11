// Tester wire-level guard for IMDB-16 task 4 — THE NON-NEGOTIABLE.
//
// The developer's guard (governance.test.js) asserts buildMcpEnv's HEADERS, and
// mutation testing confirmed it trips when the credential inside buildMcpEnv is
// swapped. But it does NOT observe what createMcpSession actually hands the
// child: overriding HEADERS at the StdioClientTransport env (`env: {
// ...buildMcpEnv(...), HEADERS: <service credential> }`) left the entire suite
// green. This test closes that hole by watching the WIRE: it spawns the REAL
// mcp-graphql child through the REAL createMcpSession, pointed at a local HTTP
// server that records the Authorization header of every request, runs a real
// query-graphql call, and asserts the header that arrives is `Bearer <the
// requesting user's Firebase ID token>` — nothing else, no service identity,
// varying per user. Any credential swap anywhere in the chain (buildMcpEnv, the
// transport env, a future refactor) fails here, because this is the request the
// router would receive.
//
// Bonus corroboration: the local server replies with the router's transparent-
// redact shape, proving extractRedactedFields recovers the coordinates from the
// REAL child's real tool-result text, not a hand-built fixture.
//
// Cost: one node child process + one loopback HTTP server per test run. No new
// dependencies (node:http only), no network beyond 127.0.0.1, no tokens spent.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import test from 'node:test'

import { extractRedactedFields } from './governance.js'
import { createMcpSession } from './mcp.js'

// The router's transparent-redact response (docs/architecture.md, § Field-level
// governance): HTTP 200, governed field absent from data, no errors array,
// machine-readable extension.
const REDACTED_RESPONSE = {
  data: { title: { primaryTitle: 'Inception', rating: { averageRating: 8.8 } } },
  extensions: { governance: { redactedFields: ['Rating.numVotes'], roles: [], revision: 8 } },
}

// Local stand-in for the router: records every request's Authorization header,
// answers everything with the redacted shape.
async function startCaptureServer() {
  const authHeaders = []
  const server = http.createServer((req, res) => {
    authHeaders.push(req.headers.authorization)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(REDACTED_RESPONSE))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  return {
    endpoint: `http://127.0.0.1:${port}/graphql`,
    authHeaders,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function runQueryAs(idToken, capture) {
  const session = await createMcpSession({ idToken, endpoint: capture.endpoint })
  try {
    return await session.callTool('query-graphql', {
      query: '{ title(tconst: "tt1375666") { primaryTitle rating { averageRating numVotes } } }',
    })
  } finally {
    await session.close()
  }
}

test(
  'WIRE GUARD: the real mcp-graphql child authenticates to the router as the requesting user — never a service identity',
  { timeout: 30000 },
  async () => {
    const capture = await startCaptureServer()
    try {
      const aliceToken = 'firebase-id-token-alice'
      const result = await runQueryAs(aliceToken, capture)

      // The child really queried our stand-in router.
      assert.ok(capture.authHeaders.length >= 1, 'expected the MCP child to hit the endpoint')

      // Every request on the wire carried EXACTLY the requesting user's token —
      // the same credential the browser uses. A service credential swapped in
      // anywhere (buildMcpEnv, the transport env, a refactor) fails here.
      for (const header of capture.authHeaders) {
        assert.equal(header, `Bearer ${aliceToken}`)
        assert.doesNotMatch(header, /service|iam\.gserviceaccount|router|sk-ant|apikey/i)
      }

      // Per-request identity, not a constant: a different user, different header.
      const before = capture.authHeaders.length
      await runQueryAs('firebase-id-token-bob', capture)
      const bobHeaders = capture.authHeaders.slice(before)
      assert.ok(bobHeaders.length >= 1)
      for (const header of bobHeaders) assert.equal(header, 'Bearer firebase-id-token-bob')

      // Corroboration for task 2's parser: the REAL child's real success-path
      // text yields the redacted coordinates (redaction is not an MCP error).
      assert.equal(result.isError, false)
      assert.deepEqual(extractRedactedFields(result.text), ['Rating.numVotes'])
    } finally {
      await capture.close()
    }
  },
)
