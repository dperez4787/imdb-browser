// The Anthropic agentic loop (docs/architecture.md, "Chat backend API
// contract"): @anthropic-ai/sdk, model claude-opus-4-8, streaming
// (messages.stream), tool-use loop over the MCP server's tools
// (introspect-schema + query-graphql), max_tokens 2048, max 8 tool iterations.
//
// Both collaborators are injected through createAgent({ anthropic,
// createMcpSession }) so tests fake them at this seam and never spend real API
// tokens or spawn a real child process. This module supplies the real defaults.
import Anthropic from '@anthropic-ai/sdk'

import {
  ANTHROPIC_MODEL,
  MAX_TOKENS,
  MAX_TOOL_ITERATIONS,
  SYSTEM_PROMPT,
} from './config.js'
import { createMcpSession as realCreateMcpSession } from './mcp.js'

// Lazy default client: constructing Anthropic() throws without an API key, and
// the server must boot (and serve /health) with no env at all. The key is read
// from the environment only — never from code, never logged.
let defaultClient
function getDefaultClient() {
  defaultClient ??= new Anthropic()
  return defaultClient
}

export function createAgent({ anthropic, createMcpSession = realCreateMcpSession } = {}) {
  // Runs one chat request. `messages` is the validated, capped history from the
  // client; `idToken` is the requester's verified Firebase ID token, forwarded
  // to the router by the MCP child; `emit(event, data)` writes SSE events
  // (`text` {delta} and `tool` {name} — the handler owns `done`/`error`).
  // Resolves to { usage: { input_tokens, output_tokens } }.
  return async function runChat({ messages, idToken, emit }) {
    const client = anthropic ?? getDefaultClient()
    const mcp = await createMcpSession({ idToken })

    const usage = { input_tokens: 0, output_tokens: 0 }
    const conversation = messages.map((m) => ({ role: m.role, content: m.content }))

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const stream = client.messages.stream({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: mcp.tools,
          messages: conversation,
        })

        stream.on('text', (delta) => emit('text', { delta }))

        const message = await stream.finalMessage()
        usage.input_tokens += message.usage?.input_tokens ?? 0
        usage.output_tokens += message.usage?.output_tokens ?? 0

        if (message.stop_reason !== 'tool_use') {
          return { usage }
        }

        // Echo the assistant turn (including tool_use blocks), execute every
        // requested tool, and return all results in ONE user message.
        conversation.push({ role: 'assistant', content: message.content })

        const toolUses = message.content.filter((block) => block.type === 'tool_use')
        const results = []
        for (const toolUse of toolUses) {
          // The UI gets the tool NAME only — never query internals.
          emit('tool', { name: toolUse.name })
          // Logged tool calls are how the acceptance criteria verify the loop
          // ran real GraphQL; log names, never inputs (they could embed user
          // text) and never tokens.
          console.log(`tool call: ${toolUse.name} (iteration ${iteration + 1})`)

          let result
          try {
            result = await mcp.callTool(toolUse.name, toolUse.input)
          } catch (err) {
            result = { text: `Tool execution failed: ${err.message}`, isError: true }
          }
          results.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.text || '(empty result)',
            is_error: result.isError === true,
          })
        }
        conversation.push({ role: 'user', content: results })
      }

      // Tool-iteration cap hit (guardrail): stop and say so.
      const apology =
        "\n\nI hit my limit for how many times I can query the data source in one turn, so I couldn't finish answering. Please try a more specific question."
      emit('text', { delta: apology })
      return { usage }
    } finally {
      await mcp.close().catch(() => {})
    }
  }
}
