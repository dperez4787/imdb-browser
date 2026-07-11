// The MCP module mostly wires the SDK to a child process, which tests don't
// spawn. What IS testable deterministically: the child-process environment
// that carries the router endpoint and the user's forwarded credential.
import assert from 'node:assert/strict'
import test from 'node:test'

import { ROUTER_GRAPHQL_URL } from './config.js'
import { buildMcpEnv } from './mcp.js'

test('the MCP child gets the router endpoint and the forwarded Firebase token', () => {
  const env = buildMcpEnv({ idToken: 'user-id-token' })
  assert.equal(env.ENDPOINT, ROUTER_GRAPHQL_URL)
  assert.deepEqual(JSON.parse(env.HEADERS), { Authorization: 'Bearer user-id-token' })
})

test('mutations stay disabled', () => {
  const env = buildMcpEnv({ idToken: 't' })
  assert.equal(env.ALLOW_MUTATIONS, 'false')
})

test('the endpoint is overridable for local development', () => {
  const env = buildMcpEnv({ idToken: 't', endpoint: 'http://localhost:4000/graphql' })
  assert.equal(env.ENDPOINT, 'http://localhost:4000/graphql')
})
