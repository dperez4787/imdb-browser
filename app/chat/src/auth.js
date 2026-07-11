// The /api/chat authentication gate and the default firebase-admin verifier.
//
// Same seam as linear-example's backend: the verifier is INJECTED through
// createApp({ verifyToken }); this module only supplies the default. Tests
// substitute the verifier without monkey-patching firebase-admin, which is what
// lets the suite prove "401 before any Anthropic call" in-process with no
// emulator and no network.
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { PROJECT_ID } from './config.js'

// Default verifier. firebase-admin initializes LAZILY — on first verification,
// never at import or process start — so the server boots and /health returns
// 200 with no .env, no ADC, and no network (Cloud Run health-checks the port on
// a cold container before any credentials matter).
export async function firebaseVerifyToken(idToken) {
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID })
  }
  return getAuth().verifyIdToken(idToken)
}

// The gate. Mounts on /api/chat, after /health.
//
//  - A missing or non-Bearer Authorization header short-circuits to 401 WITHOUT
//    calling the verifier — and therefore provably without any Anthropic call,
//    which only ever happens downstream of this middleware.
//  - Otherwise it awaits verifyToken(token). On success it attaches
//    req.auth = { uid, idToken } — the raw token is kept because the MCP server
//    forwards it to the cosmo router as the user's own credential. On ANY
//    rejection it fails the request as 401 via next(err).
export function authGate(verifyToken) {
  return async function authenticate(req, res, next) {
    const header = req.get('authorization') ?? ''
    const match = /^Bearer (.+)$/.exec(header)
    if (!match) {
      next(unauthorized('Missing or malformed Authorization header'))
      return
    }

    try {
      const decoded = await verifyToken(match[1])
      req.auth = { uid: decoded.uid, idToken: match[1] }
      next()
    } catch {
      next(unauthorized('Invalid or expired token'))
    }
  }
}

function unauthorized(message) {
  const err = new Error(message)
  err.status = 401
  return err
}
