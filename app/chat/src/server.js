// Process entry point. Kept separate from app.js so tests import createApp
// without binding a port. Cloud Run injects PORT and health-checks it; the
// server must listen immediately with no credentials required — the Anthropic
// client and firebase-admin both initialize lazily on first use.
import { createApp } from './app.js'

const PORT = process.env.PORT ?? 8080

const app = createApp()

app.listen(PORT, () => {
  console.log(`chat backend listening on ${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    // Boot is allowed without the key (health checks must pass), but chat
    // requests will fail until it is provided. Never log the key itself.
    console.warn('ANTHROPIC_API_KEY is not set — /api/chat will fail until it is')
  }
})
