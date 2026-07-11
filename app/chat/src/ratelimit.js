// In-memory per-uid sliding-window rate limiter (contract: 10 req/min per
// verified uid → 429). In-memory is the recorded decision: max-instances stays
// small; a shared store is deliberate later work.
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './config.js'

export function createRateLimiter({
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  now = Date.now,
} = {}) {
  const hits = new Map() // uid -> array of timestamps within the window

  return {
    // Records one request for `uid`; returns true if it is allowed.
    take(uid) {
      const t = now()
      const cutoff = t - windowMs
      const recent = (hits.get(uid) ?? []).filter((ts) => ts > cutoff)
      if (recent.length >= max) {
        hits.set(uid, recent)
        return false
      }
      recent.push(t)
      hits.set(uid, recent)
      return true
    },
  }
}
