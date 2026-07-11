// CORS coverage for IMDB-15, exercised through the real app at the
// createApp() injection seam (same pattern as app.test.js): the preflight
// response shape, allow-origin on error responses and on the SSE stream,
// /health unregressed, and — critically — that Access-Control-Allow-Credentials
// is never set (wildcard + credentials is the combination the ticket forbids).
import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createApp } from './app.js'

const DEV_ORIGIN = 'http://localhost:5173'

// superagent has no parser for text/event-stream; collect the raw body.
const sseParser = (res, done) => {
  res.setEncoding('utf8')
  let text = ''
  res.on('data', (chunk) => (text += chunk))
  res.on('end', () => done(null, text))
}

function fakeAgent(impl) {
  const calls = []
  const fn = async (args) => {
    calls.push(args)
    if (impl) return impl(args)
    return { usage: { input_tokens: 0, output_tokens: 0 } }
  }
  fn.calls = calls
  return fn
}

const allowAll = { take: () => true }
const acceptToken = async (token) => {
  if (token !== 'good-token') throw new Error('bad token')
  return { uid: 'user-1' }
}

function appWith({ runChat = fakeAgent(), verifyToken = acceptToken, rateLimiter = allowAll } = {}) {
  return createApp({ runChat, verifyToken, rateLimiter })
}

const validBody = { messages: [{ role: 'user', content: 'best Nolan titles?' }] }

function assertNoCredentialsHeader(res) {
  assert.equal(
    res.headers['access-control-allow-credentials'],
    undefined,
    'Access-Control-Allow-Credentials must never be set (wildcard origin)',
  )
}

// --- preflight ---------------------------------------------------------------

test('OPTIONS /api/chat preflight is 2xx with permissive headers and never reaches auth', async () => {
  let verifierCalls = 0
  const verifyToken = async () => {
    verifierCalls += 1
    throw new Error('preflight must not reach the verifier')
  }

  const res = await request(appWith({ verifyToken }))
    .options('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type')

  assert.ok(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.match(res.headers['access-control-allow-methods'], /\bPOST\b/)
  assert.match(res.headers['access-control-allow-headers'], /authorization/i)
  assert.match(res.headers['access-control-allow-headers'], /content-type/i)
  assertNoCredentialsHeader(res)
  assert.equal(verifierCalls, 0)
})

// --- error responses stay readable cross-origin -------------------------------

test('cross-origin POST with an invalid token reaches auth: 401 carrying allow-origin', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer forged-token')
    .send(validBody)

  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /Invalid or expired/)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assertNoCredentialsHeader(res)
  assert.equal(runChat.calls.length, 0)
})

// --- the SSE stream itself ------------------------------------------------------

test('a valid authenticated POST streams SSE with allow-origin on the response', async () => {
  const runChat = fakeAgent(({ emit }) => {
    emit('text', { delta: 'hello' })
    return { usage: { input_tokens: 1, output_tokens: 2 } }
  })

  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Origin', DEV_ORIGIN)
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(sseParser)

  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'], /text\/event-stream/)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assertNoCredentialsHeader(res)
  assert.match(res.body, /event: text\ndata: {"delta":"hello"}/)
})

// --- /health unregressed --------------------------------------------------------

test('GET /health still returns 200 {status:"ok"}, now with allow-origin', async () => {
  const res = await request(appWith()).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assertNoCredentialsHeader(res)
})
