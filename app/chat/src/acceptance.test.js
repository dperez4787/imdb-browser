// Tester acceptance tests for IMDB-10 (independent of the developer's suites).
// Each test maps to a ticket acceptance criterion / contract clause from
// docs/architecture.md § "Chat backend API contract". External systems
// (Anthropic, MCP child, firebase-admin) are faked at the createApp/createAgent
// injection seams — zero API tokens spent, zero credentials, zero network.
//
// Angles deliberately different from the developer's tests:
//  - SSE frames are validated at the WIRE level (exact `event:`/`data:`/blank-
//    line framing and closed data shapes), not via a lenient regex parse.
//  - Auth ordering is proven by recording the interleaved call order of the
//    verifier and the agent, not just "agent call count is zero".
//  - Rate limiting drives the REAL createRateLimiter through the REAL HTTP
//    stack with an injected clock: 10 allowed, 11th → 429, window slides.
//  - The agentic loop is exercised END TO END through HTTP: request → auth →
//    validation → createAgent (fake Anthropic + fake MCP) → SSE out.
import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createAgent } from './anthropic.js'
import { createApp } from './app.js'
import { ANTHROPIC_MODEL, MAX_TOKENS, MAX_TOOL_ITERATIONS } from './config.js'
import { createRateLimiter } from './ratelimit.js'

// --- strict SSE wire parsing -------------------------------------------------

// superagent has no text/event-stream parser; capture raw bytes.
const rawBody = (res, done) => {
  res.setEncoding('utf8')
  let text = ''
  res.on('data', (c) => (text += c))
  res.on('end', () => done(null, text))
}

// Parse STRICTLY: the stream must be a sequence of frames, each exactly
// `event: <name>\ndata: <one JSON line>\n\n`. Anything else throws.
function parseSseStrict(raw) {
  assert.ok(raw.endsWith('\n\n'), `stream must end with a blank line, got: ${JSON.stringify(raw.slice(-8))}`)
  return raw
    .slice(0, -2)
    .split('\n\n')
    .map((frame) => {
      const lines = frame.split('\n')
      assert.equal(lines.length, 2, `frame must be exactly 2 lines: ${JSON.stringify(frame)}`)
      const event = /^event: (\S+)$/.exec(lines[0])?.[1]
      assert.ok(event, `first line must be "event: <name>": ${JSON.stringify(lines[0])}`)
      assert.ok(lines[1].startsWith('data: '), `second line must be "data: <json>": ${JSON.stringify(lines[1])}`)
      return { event, data: JSON.parse(lines[1].slice('data: '.length)) }
    })
}

function assertKeys(obj, keys, label) {
  assert.deepEqual(Object.keys(obj).sort(), [...keys].sort(), `${label} must have exactly keys ${keys}`)
}

// --- shared fakes --------------------------------------------------------------

const okVerify = async (token) => {
  if (token !== 'valid-token') throw new Error('verification failed')
  return { uid: 'uid-tester' }
}
const noLimit = { take: () => true }
const idleAgent = async () => ({ usage: { input_tokens: 0, output_tokens: 0 } })

const ask = (content = 'highest-rated Christopher Nolan titles?') => ({
  messages: [{ role: 'user', content }],
})

function sseRequest(app, body, token = 'valid-token') {
  const req = request(app).post('/api/chat')
  if (token !== null) req.set('Authorization', `Bearer ${token}`)
  return req.send(body).buffer(true).parse(rawBody)
}

// --- AC: /health -----------------------------------------------------------------

test('AC-health: GET /health is 200 {status:"ok"} with no Authorization header', async () => {
  const app = createApp({ verifyToken: okVerify, runChat: idleAgent, rateLimiter: noLimit })
  const res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
})

// --- AC: auth before any Anthropic spend --------------------------------------------

test('AC-auth-ordering: the verifier resolves BEFORE the agent runs; rejection means the agent is unreachable', async () => {
  const order = []

  // Verifier that resolves asynchronously and records when it finishes —
  // if the handler ever started the agent early, 'agent' would precede 'verified'.
  const slowVerify = async (token) => {
    order.push('verify-start')
    await new Promise((r) => setTimeout(r, 20))
    order.push('verify-settled')
    if (token !== 'valid-token') throw new Error('nope')
    return { uid: 'uid-tester' }
  }
  const agent = async (args) => {
    order.push('agent')
    args.emit('text', { delta: 'hi' })
    return { usage: { input_tokens: 1, output_tokens: 1 } }
  }
  const app = createApp({ verifyToken: slowVerify, runChat: agent, rateLimiter: noLimit })

  // Invalid token: 401, and the agent NEVER appears in the order log.
  const denied = await sseRequest(app, ask(), 'forged')
  assert.equal(denied.status, 401)
  assert.deepEqual(order, ['verify-start', 'verify-settled'])

  // Valid token: the agent runs only after verification settles.
  order.length = 0
  const allowed = await sseRequest(app, ask())
  assert.equal(allowed.status, 200)
  assert.deepEqual(order, ['verify-start', 'verify-settled', 'agent'])
})

test('AC-auth-unauthenticated: missing header and non-Bearer scheme are 401 without invoking the verifier or the agent', async () => {
  let verifierCalls = 0
  let agentCalls = 0
  const app = createApp({
    verifyToken: async () => {
      verifierCalls += 1
      throw new Error('should not be reached')
    },
    runChat: async () => {
      agentCalls += 1
      return { usage: {} }
    },
    rateLimiter: noLimit,
  })

  const noHeader = await request(app).post('/api/chat').send(ask())
  assert.equal(noHeader.status, 401)

  const basic = await request(app).post('/api/chat').set('Authorization', 'Basic dXNlcjpwdw==').send(ask())
  assert.equal(basic.status, 401)

  assert.equal(verifierCalls, 0, 'malformed headers must short-circuit before the verifier')
  assert.equal(agentCalls, 0, 'the spend path must be unreachable unauthenticated')
})

// --- AC: SSE event framing (contract shapes) ------------------------------------------

test('AC-sse-framing: text/tool/done frames are exact SSE wire frames with the contract data shapes', async () => {
  const agent = async ({ emit }) => {
    emit('text', { delta: 'Checking' })
    emit('tool', { name: 'introspect-schema' })
    emit('tool', { name: 'query-graphql' })
    emit('text', { delta: ' — Oppenheimer (8.3).' })
    return { usage: { input_tokens: 123, output_tokens: 456 } }
  }
  const app = createApp({ verifyToken: okVerify, runChat: agent, rateLimiter: noLimit })

  const res = await sseRequest(app, ask())
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'], /^text\/event-stream/)

  const events = parseSseStrict(res.body)
  assert.deepEqual(
    events.map((e) => e.event),
    ['text', 'tool', 'tool', 'text', 'done'],
  )
  for (const e of events) {
    if (e.event === 'text') {
      assertKeys(e.data, ['delta'], 'text event')
      assert.equal(typeof e.data.delta, 'string')
    }
    if (e.event === 'tool') {
      // Name ONLY — query internals must not leak to the client.
      assertKeys(e.data, ['name'], 'tool event')
    }
  }
  const done = events.at(-1)
  assertKeys(done.data, ['usage'], 'done event')
  assertKeys(done.data.usage, ['input_tokens', 'output_tokens'], 'done.usage')
  assert.deepEqual(done.data.usage, { input_tokens: 123, output_tokens: 456 })
})

test('AC-sse-error: a mid-stream upstream failure ends the stream with an error {kind, message} frame that hides details', async () => {
  const agent = async ({ emit }) => {
    emit('text', { delta: 'partial answer' })
    throw new Error('ANTHROPIC_API_KEY invalid — internal detail')
  }
  const app = createApp({ verifyToken: okVerify, runChat: agent, rateLimiter: noLimit })

  const res = await sseRequest(app, ask())
  const events = parseSseStrict(res.body)
  assert.deepEqual(
    events.map((e) => e.event),
    ['text', 'error'],
  )
  const err = events.at(-1)
  assertKeys(err.data, ['kind', 'message'], 'error event')
  assert.equal(typeof err.data.kind, 'string')
  assert.equal(typeof err.data.message, 'string')
  assert.doesNotMatch(err.data.message, /ANTHROPIC|internal detail/i, 'upstream details must not leak')
})

// --- AC: history & body caps ------------------------------------------------------

test('AC-history-cap: exactly 20 messages is accepted; 21 is 400 with no agent call', async () => {
  let agentCalls = 0
  const agent = async ({ emit }) => {
    agentCalls += 1
    emit('text', { delta: 'ok' })
    return { usage: { input_tokens: 0, output_tokens: 0 } }
  }
  const app = createApp({ verifyToken: okVerify, runChat: agent, rateLimiter: noLimit })

  const history = (n) =>
    Array.from({ length: n }, (_, i) => ({
      role: i % 2 === n % 2 ? 'assistant' : 'user', // ensures the last is 'user'
      content: `turn ${i}`,
    }))

  const atCap = await sseRequest(app, { messages: history(20) })
  assert.equal(atCap.status, 200)
  assert.equal(agentCalls, 1)

  const overCap = await sseRequest(app, { messages: history(21) })
  assert.equal(overCap.status, 400)
  assert.equal(agentCalls, 1, '21 messages must not reach the agent')
})

test('AC-body-cap: a body over 16 KB is 413 before validation, auth spend, or the agent', async () => {
  let agentCalls = 0
  const app = createApp({
    verifyToken: okVerify,
    runChat: async () => {
      agentCalls += 1
      return { usage: {} }
    },
    rateLimiter: noLimit,
  })

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', 'Bearer valid-token')
    .send(ask('N'.repeat(16 * 1024 + 1)))
  assert.equal(res.status, 413)
  assert.equal(agentCalls, 0)
})

// --- AC: rate limit — REAL limiter through the REAL HTTP stack ------------------------

test('AC-rate-limit: 10 req/min per uid pass, the 11th is 429 with an SSE error, and the window slides', async () => {
  let clock = 1_000_000
  const limiter = createRateLimiter({ now: () => clock }) // real limiter, contract defaults, injected clock
  let agentCalls = 0
  const agent = async ({ emit }) => {
    agentCalls += 1
    emit('text', { delta: 'ok' })
    return { usage: { input_tokens: 0, output_tokens: 0 } }
  }
  const verify = async (token) => ({ uid: token }) // uid == bearer token, to drive two users
  const app = createApp({ verifyToken: verify, runChat: agent, rateLimiter: limiter })

  for (let i = 0; i < 10; i++) {
    const res = await sseRequest(app, ask(), 'uid-a')
    assert.equal(res.status, 200, `request ${i + 1} of 10 must pass`)
  }
  assert.equal(agentCalls, 10)

  const eleventh = await sseRequest(app, ask(), 'uid-a')
  assert.equal(eleventh.status, 429)
  assert.match(eleventh.headers['content-type'], /^text\/event-stream/)
  const events = parseSseStrict(eleventh.body)
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'error')
  assertKeys(events[0].data, ['kind', 'message'], '429 error event')
  assert.equal(events[0].data.kind, 'rate-limited')
  assert.equal(agentCalls, 10, 'the 429 path must not reach the agent')

  // Another uid is unaffected.
  const otherUser = await sseRequest(app, ask(), 'uid-b')
  assert.equal(otherUser.status, 200)

  // The window slides: 61 s later uid-a is allowed again.
  clock += 61_000
  const later = await sseRequest(app, ask(), 'uid-a')
  assert.equal(later.status, 200)
})

// --- AC: guardrails through the full stack (fake Anthropic + fake MCP, real loop) ------

test('AC-loop-guardrails: through HTTP, the real agent loop uses the contract model/max_tokens, emits tool names, and stops at 8 iterations', async () => {
  const streamParams = []
  const toolTurn = {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Querying.' },
      { type: 'tool_use', id: 't1', name: 'query-graphql', input: { query: '{ secret }' } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  }
  const anthropic = {
    messages: {
      stream(params) {
        streamParams.push(params)
        return {
          on() {
            return this
          },
          async finalMessage() {
            return toolTurn // ALWAYS asks for a tool → must hit the iteration cap
          },
        }
      },
    },
  }
  let mcpClosed = 0
  const createMcpSession = async () => ({
    tools: [{ name: 'query-graphql', description: '', input_schema: { type: 'object' } }],
    callTool: async () => ({ text: '{"data":{}}', isError: false }),
    close: async () => {
      mcpClosed += 1
    },
  })
  const app = createApp({
    verifyToken: okVerify,
    runChat: createAgent({ anthropic, createMcpSession }),
    rateLimiter: noLimit,
  })

  const res = await sseRequest(app, ask())
  assert.equal(res.status, 200)

  // The contract's model + max_tokens on every turn; loop capped at 8.
  assert.equal(streamParams.length, MAX_TOOL_ITERATIONS)
  for (const p of streamParams) {
    assert.equal(p.model, ANTHROPIC_MODEL)
    assert.equal(p.max_tokens, MAX_TOKENS)
  }

  const events = parseSseStrict(res.body)
  const toolEvents = events.filter((e) => e.event === 'tool')
  assert.equal(toolEvents.length, MAX_TOOL_ITERATIONS)
  for (const e of toolEvents) {
    assert.deepEqual(e.data, { name: 'query-graphql' }, 'tool events carry the name only')
  }
  // The stream must not leak the GraphQL query anywhere.
  assert.doesNotMatch(res.body, /\{ secret \}/)

  // Cap hit → honest "couldn't finish" text, then done; MCP child torn down.
  const textAfterTools = events.filter((e) => e.event === 'text').at(-1)
  assert.match(textAfterTools.data.delta, /couldn't finish/i)
  assert.equal(events.at(-1).event, 'done')
  assert.equal(mcpClosed, 1)
})
