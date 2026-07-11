// Request-body validation for POST /api/chat (contract: body is
// { messages: [{ role: "user"|"assistant", content: "…" }] }, full history
// from the client, newest last, max 20 messages; oversize body → 400/413).
// The 16 KB byte cap is enforced by express.json({ limit }) → 413; everything
// shape-related lives here → 400.
import { MAX_MESSAGES } from './config.js'

// Returns the validated messages array, or throws an error with status 400.
export function validateChatBody(body) {
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    throw badRequest('Body must be { "messages": [...] } with at least one message')
  }
  if (messages.length > MAX_MESSAGES) {
    throw badRequest(`Too many messages: history is capped at ${MAX_MESSAGES}`)
  }
  for (const m of messages) {
    if (m == null || (m.role !== 'user' && m.role !== 'assistant')) {
      throw badRequest('Each message must have role "user" or "assistant"')
    }
    if (typeof m.content !== 'string' || m.content.length === 0) {
      throw badRequest('Each message must have non-empty string content')
    }
  }
  if (messages[messages.length - 1].role !== 'user') {
    throw badRequest('The last message must be from the user')
  }
  return messages
}

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}
