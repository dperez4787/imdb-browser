// HTTP-surface tests: auth rejection (401 with zero Anthropic spend), history
// caps (400/413), rate limiting (429), and SSE event framing. Every external
// system is faked at the createApp() injection seam — no Anthropic tokens, no
// firebase credentials, no child processes, no network.
import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createApp } from './app.js'

// --- helpers ---------------------------------------------------------------

// superagent has no parser for text/event-stream; collect the raw body.
const sseParser = (res, done) => {
  res.setEncoding('utf8')
  let text = ''
  res.on('data', (chunk) => (text += chunk))
  res.on('end', () => done(null, text))
}

function parseSse(raw) {
  return raw
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1]
      const data = /^data: (.+)$/m.exec(block)?.[1]
      return { event, data: data ? JSON.parse(data) : undefined }
    })
}

// A runChat fake that records invocations; scriptable per test.
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

// --- /health ---------------------------------------------------------------

test('GET /health returns 200 without auth', async () => {
  const res = await request(appWith()).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
})

// --- auth: 401 before any Anthropic call ------------------------------------

test('POST /api/chat without Authorization header is 401 and never calls the agent', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat })).post('/api/chat').send(validBody)
  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /Authorization/)
  assert.equal(runChat.calls.length, 0)
})

test('POST /api/chat with a non-Bearer header is 401 and never calls the agent', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Basic abc123')
    .send(validBody)
  assert.equal(res.status, 401)
  assert.equal(runChat.calls.length, 0)
})

test('POST /api/chat with an invalid token is 401 and never calls the agent', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Bearer forged-token')
    .send(validBody)
  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /Invalid or expired/)
  assert.equal(runChat.calls.length, 0)
})

// --- history / size caps ----------------------------------------------------

test('more than 20 messages is 400 and never calls the agent', async () => {
  const runChat = fakeAgent()
  const messages = Array.from({ length: 21 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }))
  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send({ messages })
  assert.equal(res.status, 400)
  assert.match(res.body.error.message, /capped at 20/)
  assert.equal(runChat.calls.length, 0)
})

test('missing/empty messages array is 400', async () => {
  for (const body of [{}, { messages: [] }, { messages: 'hi' }]) {
    const res = await request(appWith())
      .post('/api/chat')
      .set('Authorization', 'Bearer good-token')
      .send(body)
    assert.equal(res.status, 400)
  }
})

test('bad message shape is 400', async () => {
  for (const messages of [
    [{ role: 'system', content: 'x' }],
    [{ role: 'user', content: 42 }],
    [{ role: 'user', content: '' }],
    [{ role: 'assistant', content: 'ends with assistant' }],
  ]) {
    const res = await request(appWith())
      .post('/api/chat')
      .set('Authorization', 'Bearer good-token')
      .send({ messages })
    assert.equal(res.status, 400, JSON.stringify(messages))
  }
})

test('a body over 16 KB is rejected with 413 and never calls the agent', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send({ messages: [{ role: 'user', content: 'x'.repeat(17 * 1024) }] })
  assert.equal(res.status, 413)
  assert.equal(runChat.calls.length, 0)
})

// --- SSE framing --------------------------------------------------------------

test('a valid chat request streams text/tool/done SSE events in order', async () => {
  const runChat = fakeAgent(({ emit }) => {
    emit('text', { delta: 'Looking' })
    emit('tool', { name: 'query-graphql' })
    emit('text', { delta: ' that up.' })
    return { usage: { input_tokens: 12, output_tokens: 34 } }
  })

  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(sseParser)

  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'], /text\/event-stream/)

  const events = parseSse(res.body)
  assert.deepEqual(events, [
    { event: 'text', data: { delta: 'Looking' } },
    { event: 'tool', data: { name: 'query-graphql' } },
    { event: 'text', data: { delta: ' that up.' } },
    { event: 'done', data: { usage: { input_tokens: 12, output_tokens: 34 } } },
  ])

  // The agent received the validated history and the raw forwarded token.
  assert.equal(runChat.calls.length, 1)
  assert.equal(runChat.calls[0].idToken, 'good-token')
  assert.deepEqual(runChat.calls[0].messages, validBody.messages)
})

test('an agent failure mid-stream becomes an SSE error event, not a crash', async () => {
  const runChat = fakeAgent(({ emit }) => {
    emit('text', { delta: 'partial' })
    throw new Error('anthropic exploded: secret details')
  })

  const res = await request(appWith({ runChat }))
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(sseParser)

  assert.equal(res.status, 200) // status was already committed when the stream started
  const events = parseSse(res.body)
  assert.equal(events.length, 2)
  assert.deepEqual(events[0], { event: 'text', data: { delta: 'partial' } })
  assert.equal(events[1].event, 'error')
  assert.equal(events[1].data.kind, 'upstream')
  // Upstream details must not leak to the client.
  assert.doesNotMatch(events[1].data.message, /secret details/)
})

// --- rate limiting -------------------------------------------------------------

test('an over-limit request is 429 with a friendly SSE error and never calls the agent', async () => {
  const runChat = fakeAgent()
  const res = await request(appWith({ runChat, rateLimiter: { take: () => false } }))
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(sseParser)

  assert.equal(res.status, 429)
  assert.match(res.headers['content-type'], /text\/event-stream/)
  const events = parseSse(res.body)
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'error')
  assert.equal(events[0].data.kind, 'rate-limited')
  assert.equal(runChat.calls.length, 0)
})

test('the rate limiter is keyed by the verified uid', async () => {
  const seen = []
  const app = appWith({
    rateLimiter: {
      take: (uid) => {
        seen.push(uid)
        return true
      },
    },
  })
  await request(app)
    .post('/api/chat')
    .set('Authorization', 'Bearer good-token')
    .send(validBody)
    .buffer(true)
    .parse(sseParser)
  assert.deepEqual(seen, ['user-1'])
})
