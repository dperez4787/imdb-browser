// Field-level governance awareness (IMDB-16). Four things this suite locks in:
//   1. extractRedactedFields parses the router's transparent-redact signal.
//   2. SSE framing: the agent forwards redactedFields on the `tool` event, and
//      a redacted result is a SUCCESS (is_error stays false) — no retry loop.
//   3. THE NON-NEGOTIABLE passthrough guard: the mcp-graphql Authorization
//      header is the requesting user's forwarded Firebase token, never a
//      service identity.
//   4. The system prompt tells the model to name restricted fields, never guess
//      their values, offer what is accessible, and mention an admin can grant.
// Everything is faked at the createAgent()/buildMcpEnv seams — no token spend,
// no child process, no live router.
import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgent } from './anthropic.js'
import { SYSTEM_PROMPT } from './config.js'
import { extractRedactedFields } from './governance.js'
import { buildMcpEnv } from './mcp.js'

// --- a query-graphql result exactly as mcp-graphql returns it on the router's
// transparent-redact success path: HTTP 200, no `errors`, governed fields
// absent from `data`, coordinates named in extensions.governance. -----------
function redactedResult(redactedFields) {
  return JSON.stringify(
    {
      data: { title: { primaryTitle: 'Inception', rating: { averageRating: 8.8 } } },
      extensions: { governance: { redactedFields, roles: [], revision: 8 } },
    },
    null,
    2,
  )
}

const CLEAN_RESULT = JSON.stringify({ data: { title: { primaryTitle: 'Inception' } } }, null, 2)

// --- extractRedactedFields ---------------------------------------------------

test('extractRedactedFields pulls the governed coordinates from a redacted result', () => {
  assert.deepEqual(extractRedactedFields(redactedResult(['Rating.numVotes'])), ['Rating.numVotes'])
  assert.deepEqual(extractRedactedFields(redactedResult(['Rating.numVotes', 'Name.birthYear'])), [
    'Rating.numVotes',
    'Name.birthYear',
  ])
})

test('extractRedactedFields returns [] for a clean result and for non-governance text', () => {
  assert.deepEqual(extractRedactedFields(CLEAN_RESULT), [])
  assert.deepEqual(extractRedactedFields('not json at all'), [])
  assert.deepEqual(extractRedactedFields(''), [])
  assert.deepEqual(extractRedactedFields(undefined), [])
  // Extension present but empty list → treated as no governance.
  assert.deepEqual(extractRedactedFields(redactedResult([])), [])
})

test('extractRedactedFields de-dupes and keeps first-seen order', () => {
  assert.deepEqual(
    extractRedactedFields(redactedResult(['Rating.numVotes', 'Rating.numVotes', 'Name.birthYear'])),
    ['Rating.numVotes', 'Name.birthYear'],
  )
})

test('extractRedactedFields recovers a JSON payload embedded in surrounding prose', () => {
  const wrapped = `Here is your data: ${redactedResult(['Name.deathYear'])}\nHope that helps.`
  assert.deepEqual(extractRedactedFields(wrapped), ['Name.deathYear'])
})

// --- fakes for the agent loop (mirrors anthropic.test.js) --------------------

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

function fakeAnthropic(turns) {
  let i = 0
  return {
    messages: {
      stream() {
        const turn = turns[Math.min(i, turns.length - 1)]
        i += 1
        return fakeStream(turn)
      },
    },
  }
}

// A scripted MCP session whose callTool returns queued results in order (so one
// exchange can redact different coordinates on successive tool calls).
function fakeMcp(resultTexts) {
  const queue = [...resultTexts]
  const session = {
    tools: [{ name: 'query-graphql', description: 'query', input_schema: { type: 'object' } }],
    toolCalls: [],
    closed: 0,
    async callTool(name, args) {
      session.toolCalls.push({ name, args })
      const text = queue.length > 1 ? queue.shift() : queue[0]
      return { text, isError: false }
    },
    async close() {
      session.closed += 1
    },
  }
  return async () => session
}

function collector() {
  const events = []
  return { events, emit: (event, data) => events.push({ event, data }) }
}

const oneToolThenText = (toolInput = { query: '{ x }' }) => [
  {
    deltas: [],
    message: {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'query-graphql', input: toolInput }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  },
  {
    deltas: ['The Godfather averages 9.2 stars; vote counts are restricted for your role.'],
    message: {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '…' }],
      usage: { input_tokens: 8, output_tokens: 6 },
    },
  },
]

// --- SSE governance framing --------------------------------------------------

test('the tool event carries governance.redactedFields when the router redacted a field', async () => {
  const anthropic = fakeAnthropic(oneToolThenText())
  const createMcpSession = fakeMcp([redactedResult(['Rating.numVotes'])])
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  await runChat({ messages: [{ role: 'user', content: 'votes for GoT?' }], idToken: 't', emit })

  const toolEvents = events.filter((e) => e.event === 'tool')
  assert.equal(toolEvents.length, 1)
  assert.deepEqual(toolEvents[0].data, {
    name: 'query-graphql',
    governance: { redactedFields: ['Rating.numVotes'] },
  })
})

test('a clean tool result emits a tool event with NO governance key (additive contract)', async () => {
  const anthropic = fakeAnthropic(oneToolThenText())
  const createMcpSession = fakeMcp([CLEAN_RESULT])
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  await runChat({ messages: [{ role: 'user', content: 'title of tt1375666?' }], idToken: 't', emit })

  const toolEvents = events.filter((e) => e.event === 'tool')
  assert.equal(toolEvents.length, 1)
  assert.deepEqual(toolEvents[0].data, { name: 'query-graphql' })
  assert.equal('governance' in toolEvents[0].data, false)
})

test('multiple redacted tool calls each report their own coordinates on the event', async () => {
  // One assistant turn asking for two tools, then a text turn.
  const turns = [
    {
      deltas: [],
      message: {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'a', name: 'query-graphql', input: { query: '{ a }' } },
          { type: 'tool_use', id: 'b', name: 'query-graphql', input: { query: '{ b }' } },
        ],
        usage: {},
      },
    },
    { deltas: ['done'], message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }], usage: {} } },
  ]
  const anthropic = fakeAnthropic(turns)
  const createMcpSession = fakeMcp([
    redactedResult(['Rating.numVotes']),
    redactedResult(['Name.birthYear']),
  ])
  const runChat = createAgent({ anthropic, createMcpSession })
  const { events, emit } = collector()

  await runChat({ messages: [{ role: 'user', content: 'q' }], idToken: 't', emit })

  const governance = events.filter((e) => e.event === 'tool').map((e) => e.data.governance)
  assert.deepEqual(governance, [
    { redactedFields: ['Rating.numVotes'] },
    { redactedFields: ['Name.birthYear'] },
  ])
})

// --- retry hygiene (task 3): a redaction is a success, never a retry ---------

test('a redacted result runs exactly one tool call and is fed back as is_error:false', async () => {
  const anthropic = fakeAnthropic(oneToolThenText())
  const createMcpSession = fakeMcp([redactedResult(['Rating.numVotes'])])
  // Capture what the loop feeds back to the model on the next request.
  let session
  const wrapped = async (opts) => {
    session = await createMcpSession(opts)
    return session
  }
  const runChat = createAgent({ anthropic, createMcpSession: wrapped })
  const { emit } = collector()

  await runChat({ messages: [{ role: 'user', content: 'votes for GoT?' }], idToken: 't', emit })

  // No retry loop: the redacted question triggered a single query.
  assert.equal(session.toolCalls.length, 1)
  assert.equal(session.closed, 1)
})

test('a redacted tool_result is NOT marked is_error to the model (so it explains, not retries)', async () => {
  // Inspect the second Anthropic request: it carries the tool_result the loop
  // fed back. A redaction must arrive as a success.
  const requests = []
  let i = 0
  const turns = oneToolThenText()
  const anthropic = {
    messages: {
      stream(params) {
        requests.push(params)
        const turn = turns[Math.min(i, turns.length - 1)]
        i += 1
        return fakeStream(turn)
      },
    },
  }
  const createMcpSession = fakeMcp([redactedResult(['Rating.numVotes'])])
  const runChat = createAgent({ anthropic, createMcpSession })
  const { emit } = collector()

  await runChat({ messages: [{ role: 'user', content: 'votes?' }], idToken: 't', emit })

  const toolResult = requests[1].messages.at(-1).content[0]
  assert.equal(toolResult.type, 'tool_result')
  assert.equal(toolResult.is_error, false)
  assert.match(toolResult.content, /redactedFields/)
})

// --- THE NON-NEGOTIABLE regression guard (task 4) ----------------------------

test('GOVERNANCE GUARANTEE: the mcp-graphql Authorization header is the requesting user token, never a service identity', () => {
  const env = buildMcpEnv({ idToken: 'user-alice-firebase-id-token' })
  const headers = JSON.parse(env.HEADERS)

  // Exactly the requesting user's forwarded Firebase token — the credential the
  // browser uses — so the bot sees precisely what the user may see.
  assert.equal(headers.Authorization, 'Bearer user-alice-firebase-id-token')

  // It is the PER-REQUEST token, not a constant: a different signed-in user
  // produces a different header. A hard-coded service/router credential would
  // fail this because it would not vary with idToken.
  const bob = JSON.parse(buildMcpEnv({ idToken: 'user-bob-firebase-id-token' }).HEADERS)
  assert.equal(bob.Authorization, 'Bearer user-bob-firebase-id-token')
  assert.notEqual(bob.Authorization, headers.Authorization)

  // Defensive: the header must not smell like a service/router identity or an
  // Anthropic/API key. If someone "fixes" the passthrough into a service
  // credential, this guard trips.
  assert.doesNotMatch(headers.Authorization, /service|iam\.gserviceaccount|router|sk-ant|apikey/i)
})

// --- system prompt contract (tasks 1 & 3) ------------------------------------

test('the system prompt instructs the model on redacted fields', () => {
  const p = SYSTEM_PROMPT
  // (2) it recognises the router's signal
  assert.match(p, /redactedFields/)
  // (a) name the restricted fields in plain language
  assert.match(p, /restricted for your role/i)
  // (b) never estimate/guess the withheld values
  assert.match(p, /never/i)
  assert.match(p, /estimate|infer|guess/i)
  // (c) offer what IS available
  assert.match(p, /average rating|everything that is available|what is available/i)
  // (d) an admin can grant access
  assert.match(p, /admin can grant/i)
  // (3) retry hygiene — do not re-query
  assert.match(p, /do not re-run|re-querying|will not change within this turn/i)
})
