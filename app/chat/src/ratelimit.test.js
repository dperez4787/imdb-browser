import assert from 'node:assert/strict'
import test from 'node:test'

import { createRateLimiter } from './ratelimit.js'

test('allows up to the limit within a window, then blocks', () => {
  let t = 0
  const limiter = createRateLimiter({ max: 10, windowMs: 60_000, now: () => t })

  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.take('u1'), true, `request ${i + 1} should pass`)
  }
  assert.equal(limiter.take('u1'), false, 'request 11 should be blocked')
})

test('the window slides: old requests age out', () => {
  let t = 0
  const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: () => t })

  assert.equal(limiter.take('u1'), true)
  t = 30_000
  assert.equal(limiter.take('u1'), true)
  assert.equal(limiter.take('u1'), false)

  t = 61_000 // first request (t=0) is now outside the window
  assert.equal(limiter.take('u1'), true)
  assert.equal(limiter.take('u1'), false)
})

test('limits are per uid', () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 })
  assert.equal(limiter.take('u1'), true)
  assert.equal(limiter.take('u2'), true)
  assert.equal(limiter.take('u1'), false)
})
