// HTTP surface of the chat backend. Handlers stay thin (CLAUDE.md): auth,
// validation, rate limiting, and the Anthropic/MCP loop all live in their own
// modules and are INJECTED here, so tests fake every external system at its
// module boundary and this file never needs mocking.
//
// Contract (docs/architecture.md, "Chat backend API contract"):
//   GET  /health    — unauthenticated liveness probe
//   POST /api/chat  — Bearer <Firebase ID token>, streams SSE events:
//                     text {delta} | tool {name} | done {usage} | error {kind, message}
import express from 'express'

import { authGate, firebaseVerifyToken } from './auth.js'
import { createAgent } from './anthropic.js'
import { BODY_LIMIT } from './config.js'
import { createRateLimiter } from './ratelimit.js'
import { sseSend, sseStart } from './sse.js'
import { validateChatBody } from './validate.js'

export function createApp({
  verifyToken = firebaseVerifyToken,
  runChat = createAgent(),
  rateLimiter = createRateLimiter(),
} = {}) {
  const app = express()

  // 16 KB body cap (guardrail): express rejects larger bodies with 413 before
  // any of our code — and therefore before any Anthropic call — runs.
  app.use(express.json({ limit: BODY_LIMIT }))

  // Cloud Run liveness probe. No auth, no Anthropic, no network.
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // Order is the security property: authGate runs BEFORE anything that could
  // spend Anthropic tokens. A missing/invalid token 401s here and runChat is
  // never invoked (tests prove this by injecting a spying fake).
  app.post('/api/chat', authGate(verifyToken), async (req, res, next) => {
    // Guardrail: 10 req/min per verified uid. Per the contract this is a 429
    // carrying a friendly SSE `error` event.
    if (!rateLimiter.take(req.auth.uid)) {
      sseStart(res, 429)
      sseSend(res, 'error', {
        kind: 'rate-limited',
        message: "You're sending messages too quickly — wait a minute and try again.",
      })
      res.end()
      return
    }

    let messages
    try {
      messages = validateChatBody(req.body)
    } catch (err) {
      next(err) // 400 via the error middleware, still zero Anthropic spend
      return
    }

    sseStart(res)
    try {
      const { usage } = await runChat({
        messages,
        idToken: req.auth.idToken,
        emit: (event, data) => sseSend(res, event, data),
      })
      sseSend(res, 'done', { usage })
    } catch (err) {
      // Stream already started — errors become SSE `error` events, and the
      // message stays generic so upstream details (which could reference the
      // request) never leak. Log server-side for diagnosis.
      console.error('chat request failed:', err)
      sseSend(res, 'error', {
        kind: 'upstream',
        message: 'Something went wrong while answering. Please try again.',
      })
    } finally {
      res.end()
    }
  })

  // One error middleware maps thrown errors to JSON responses (pre-stream
  // failures only: 401 auth, 400 validation, 413 body-too-large from
  // express.json). The 4-arg signature marks it as error middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? 500
    if (status >= 500) {
      console.error(err)
      res.status(status).json({ error: { message: 'Internal Server Error' } })
      return
    }
    res.status(status).json({ error: { message: err.message } })
  })

  return app
}
