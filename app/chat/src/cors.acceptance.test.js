// Tester acceptance tests for IMDB-15 (independent of the developer's
// cors.test.js). Each test maps to a ticket criterion or a hole the
// developer's suite leaves open:
//
//  - Preflight from an ARBITRARY (non-dev) origin: wildcard means any origin's
//    preflight must succeed, not just http://localhost:5173.
//  - OPTIONS must short-circuit before the token verifier AND the rate
//    limiter (the developer's test spies only on the verifier).
//  - Allow-origin must survive onto EVERY error path a browser can hit during
//    the demo: 429 (rate limited), 400 (invalid body), 413 (oversized body).
//    An error the browser can't read is an unreadable demo failure.
//  - Access-Control-Allow-Credentials must be absent on every one of those
//    paths (wildcard + credentials is the forbidden combination).
//  - Header-casing tolerance: mixed-case request header names/values must not
//    break the preflight, and allow-headers is matched case-insensitively.
//
// External systems are faked at the createApp() injection seam — zero
// Anthropic tokens, zero credentials, zero network.
import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createApp } from './app.js'

const DEV_ORIGIN = 'http://localhost:5173'
const ARBITRARY_ORIGIN = 'https://some-other-site.example'

// superagent has no text/event-stream parser; capture raw bytes.
const rawBody = (res, done) => {
  res.setEncoding('utf8')
  let text = ''
  res.on('data', (c) => (text += c))
  res.on('end', () => done(null, text))
}

function spyVerifier() {
  const fn = async (token) => {
    fn.calls += 1
    if (token !== 'good-token') {
      const err = new Error('Invalid or expired token')
      err.status = 401
      throw err
    }
    return { uid: 'user-1' }
  }
  fn.calls = 0
  return fn
}

function spyLimiter(allow = true) {
  return {
    calls: 0,
    take() {
      this.calls += 1
      return allow
    },
  }
}

function spyAgent() {
  const fn = async ({ emit }) => {
    fn.calls += 1
    emit('text', { delta: 'hi' })
    return { usage: { input_tokens: 1, output_tokens: 1 } }
  }
  fn.calls = 0
  return fn
}

const validBody = { messages: [{ role: 'user', content: 'hello' }] }

function assertCorsReadable(res, msg = '') {
  assert.equal(
    res.headers['access-control-allow-origin'],
    '*',
    `Access-Control-Allow-Origin must be * ${msg}`,
  )
  assert.equal(
    res.headers['access-control-allow-credentials'],
    undefined,
    `Access-Control-Allow-Credentials must never be set ${msg}`,
  )
}

// --- preflight from an arbitrary origin --------------------------------------

test('IMDB-15/AC1+: preflight from an arbitrary non-dev origin also succeeds (wildcard)', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() }))
    .options('/api/chat')
    .set('Origin', ARBITRARY_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type')

  assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`)
  assertCorsReadable(res, 'on preflight from an arbitrary origin')
  assert.match(res.headers['access-control-allow-methods'] ?? '', /\bPOST\b/i)
  const allowHeaders = (res.headers['access-control-allow-headers'] ?? '').toLowerCase()
  assert.ok(allowHeaders.includes('authorization'), `authorization missing from: ${allowHeaders}`)
  assert.ok(allowHeaders.includes('content-type'), `content-type missing from: ${allowHeaders}`)
})

// --- OPTIONS reaches neither the verifier nor the rate limiter ----------------

test('IMDB-15/AC1: OPTIONS preflight invokes neither the token verifier nor the rate limiter', async () => {
  const verifyToken = spyVerifier()
  const rateLimiter = spyLimiter()
  const runChat = spyAgent()

  const res = await request(createApp({ verifyToken, rateLimiter, runChat }))
    .options('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type')

  assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`)
  assert.equal(verifyToken.calls, 0, 'preflight must not reach the token verifier')
  assert.equal(rateLimiter.calls, 0, 'preflight must not consume a rate-limit slot')
  assert.equal(runChat.calls, 0, 'preflight must never reach the agent')
})

// --- allow-origin on every pre-stream error path ------------------------------

test('IMDB-15/AC2: forged-token cross-origin POST → 401 that the browser can read', async () => {
  const runChat = spyAgent()
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat, rateLimiter: spyLimiter() }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer forged.jwt.token')
    .send(validBody)

  assert.equal(res.status, 401)
  assertCorsReadable(res, 'on the 401 auth error')
  assert.equal(runChat.calls, 0, '401 must mean zero Anthropic spend')
})

test('IMDB-15: 429 rate-limited response still carries allow-origin (readable SSE error)', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter(false) }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(rawBody)

  assert.equal(res.status, 429)
  assertCorsReadable(res, 'on the 429 rate-limit response')
  assert.match(res.headers['content-type'] ?? '', /text\/event-stream/)
  assert.match(res.body, /event: error/)
})

test('IMDB-15: 400 invalid-body response still carries allow-origin', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer good-token')
    .send({ messages: 'not-an-array' })

  assert.equal(res.status, 400)
  assertCorsReadable(res, 'on the 400 validation error')
})

test('IMDB-15: 413 oversized-body response still carries allow-origin', async () => {
  const oversized = { messages: [{ role: 'user', content: 'x'.repeat(20 * 1024) }] }
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer good-token')
    .send(oversized)

  assert.equal(res.status, 413)
  assertCorsReadable(res, 'on the 413 body-too-large error')
})

// --- SSE stream + /health, with credentials-absence asserted ------------------

test('IMDB-15/AC3: authenticated POST streams SSE readable cross-origin, no credentials header', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(rawBody)

  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'] ?? '', /text\/event-stream/)
  assertCorsReadable(res, 'on the SSE stream')
  assert.match(res.body, /event: text\ndata: {"delta":"hi"}/)
  assert.match(res.body, /event: done/)
})

test('IMDB-15/AC4: GET /health unregressed — 200 {status:"ok"}', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() })).get(
    '/health',
  )
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
  assertCorsReadable(res, 'on /health')
})

// --- header casing tolerance ---------------------------------------------------

test('IMDB-15: preflight tolerates mixed-case header names and values', async () => {
  const res = await request(createApp({ verifyToken: spyVerifier(), runChat: spyAgent(), rateLimiter: spyLimiter() }))
    .options('/api/chat')
    .set('OrIgIn', DEV_ORIGIN)
    .set('ACCESS-CONTROL-REQUEST-METHOD', 'POST')
    .set('Access-Control-Request-Headers', 'Authorization, Content-Type')

  assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`)
  assertCorsReadable(res, 'on a mixed-case preflight')
  const allowHeaders = (res.headers['access-control-allow-headers'] ?? '').toLowerCase()
  assert.ok(allowHeaders.includes('authorization'))
  assert.ok(allowHeaders.includes('content-type'))
})
