// Agentic-loop tests: the Anthropic client and the MCP session are faked at
// the createAgent() seam, so these prove the loop's behavior (tool round-trips,
// event emission, usage accounting, the 8-iteration guardrail, MCP teardown)
// without spending a token or spawning a process.
import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgent } from './anthropic.js'
import { ANTHROPIC_MODEL, MAX_TOKENS, MAX_TOOL_ITERATIONS, SYSTEM_PROMPT } from './config.js'

// --- fakes -------------------------------------------------------------------

// Mimics the SDK's MessageStream surface used by the loop: .on('text', cb) and
// .finalMessage().
function fakeStream({ deltas = [], message }) {
  return {
    on(event, cb) {
      if (event === 'text') deltas.forEach((d) => cb(d))
      return this
    },
    async finalMessage() {
      return message
    },
  }
}

// A scripted Anthropic client: returns each turn in order, records params.
function fakeAnthropic(turns) {
  const calls = []
  let i = 0
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params)
        const turn = turns[Math.min(i, turns.length - 1)]
        i += 1
        return fakeStream(turn)
      },
    },
  }
}

function fakeMcp({ toolResult = { text: '{"data":{}}', isError: false } } = {}) {
  const session = {
    tools: [
      { name: 'introspect-schema', description: 'introspect', input_schema: { type: 'object' } },
      { name: 'query-graphql', description: 'query', input_schema: { type: 'object' } },
    ],
    toolCalls: [],
    closed: 0,
    async callTool(name, args) {
      session.toolCalls.push({ name, args })
      return toolResult
    },
    async close() {
      session.closed += 1
    },
  }
  const create = async ({ idToken }) => {
    create.idTokens.push(idToken)
    return session
  }
  create.idTokens = []
  create.session = session
  return create
}

function collector() {
  const events = []
  return { events, emit: (event, data) => events.push({ event, data }) }
}

const userMessages = [{ role: 'user', content: 'highest-rated Nolan titles?' }]

const textTurn = {
  deltas: ['The answer.'],
  message: {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'The answer.' }],
    usage: { input_tokens: 20, output_tokens: 7 },
  },
}

const toolTurn = {
  deltas: ['Let me query.'],
  message: {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Let me query.' },
      { type: 'tool_use', id: 'toolu_1', name: 'query-graphql', input: { query: '{ x }' } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
}

// --- tests ---------------------------------------------------------------------

test('a plain text turn streams deltas and returns usage', async () => {
  const anthropic = fakeAnthropic([textTurn])
  const createMcpSession = fakeMcp()
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  const { usage } = await runChat({ messages: userMessages, idToken: 'tok-1', emit })

  assert.deepEqual(events, [{ event: 'text', data: { delta: 'The answer.' } }])
  assert.deepEqual(usage, { input_tokens: 20, output_tokens: 7 })

  // Contract-decided request shape: model, max_tokens, system prompt, MCP tools.
  const params = anthropic.calls[0]
  assert.equal(params.model, ANTHROPIC_MODEL)
  assert.equal(params.max_tokens, MAX_TOKENS)
  assert.equal(params.system, SYSTEM_PROMPT)
  assert.deepEqual(
    params.tools.map((t) => t.name),
    ['introspect-schema', 'query-graphql'],
  )
  assert.deepEqual(params.messages, userMessages)

  // MCP session opened with the forwarded token and closed afterwards.
  assert.deepEqual(createMcpSession.idTokens, ['tok-1'])
  assert.equal(createMcpSession.session.closed, 1)
})

test('a tool_use turn executes the MCP tool and feeds the result back', async () => {
  const anthropic = fakeAnthropic([toolTurn, textTurn])
  const createMcpSession = fakeMcp({ toolResult: { text: '{"data":{"titles":[]}}', isError: false } })
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  const { usage } = await runChat({ messages: userMessages, idToken: 'tok-1', emit })

  // Event order: first turn's text, tool (NAME ONLY — no query internals),
  // then the final turn's text.
  assert.deepEqual(events, [
    { event: 'text', data: { delta: 'Let me query.' } },
    { event: 'tool', data: { name: 'query-graphql' } },
    { event: 'text', data: { delta: 'The answer.' } },
  ])

  // The tool was executed against the MCP session with the model's input.
  assert.deepEqual(createMcpSession.session.toolCalls, [
    { name: 'query-graphql', args: { query: '{ x }' } },
  ])

  // Second request carries the assistant turn and a matching tool_result.
  const second = anthropic.calls[1]
  assert.equal(second.messages.length, 3)
  assert.deepEqual(second.messages[1], { role: 'assistant', content: toolTurn.message.content })
  assert.deepEqual(second.messages[2], {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: '{"data":{"titles":[]}}',
        is_error: false,
      },
    ],
  })

  // Usage accumulates across turns.
  assert.deepEqual(usage, { input_tokens: 30, output_tokens: 12 })
  assert.equal(createMcpSession.session.closed, 1)
})

test('a failing tool call becomes an is_error tool_result instead of crashing', async () => {
  const anthropic = fakeAnthropic([toolTurn, textTurn])
  const createMcpSession = fakeMcp()
  createMcpSession.session.callTool = async () => {
    throw new Error('router 502')
  }
  const runChat = createAgent({ anthropic, createMcpSession })
  const { emit } = collector()

  await runChat({ messages: userMessages, idToken: 'tok-1', emit })

  const result = anthropic.calls[1].messages[2].content[0]
  assert.equal(result.is_error, true)
  assert.match(result.content, /router 502/)
})

test('the loop stops at the 8-iteration guardrail and says it could not finish', async () => {
  const anthropic = fakeAnthropic([toolTurn]) // every turn asks for a tool
  const createMcpSession = fakeMcp()
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  await runChat({ messages: userMessages, idToken: 'tok-1', emit })

  assert.equal(anthropic.calls.length, MAX_TOOL_ITERATIONS)
  assert.equal(createMcpSession.session.toolCalls.length, MAX_TOOL_ITERATIONS)

  const last = events.at(-1)
  assert.equal(last.event, 'text')
  assert.match(last.data.delta, /couldn't finish/)
  assert.equal(createMcpSession.session.closed, 1)
})

test('the MCP session is closed even when the Anthropic call fails', async () => {
  const anthropic = {
    messages: {
      stream() {
        throw new Error('boom')
      },
    },
  }
  const createMcpSession = fakeMcp()
  const runChat = createAgent({ anthropic, createMcpSession })
  const { emit } = collector()

  await assert.rejects(() => runChat({ messages: userMessages, idToken: 'tok-1', emit }), /boom/)
  assert.equal(createMcpSession.session.closed, 1)
})
