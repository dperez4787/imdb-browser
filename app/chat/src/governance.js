// Field-level governance signal on a tool result (docs/architecture.md,
// § Field-level governance). The router runs TRANSPARENT REDACT MODE: a
// query-graphql result for a user lacking a role returns HTTP 200 with the
// governed fields absent from `data` and a machine-readable report at
//   extensions.governance = { redactedFields: ["Rating.numVotes"], roles, revision }
// mcp-graphql returns that response as pretty-printed JSON text on its SUCCESS
// path (a redaction has no `errors` array, so it is not treated as an error),
// which is why the coordinates are recoverable by parsing the tool result text.
//
// This feeds two additive behaviours (IMDB-16): the SSE `tool` event gains an
// optional `governance: { redactedFields }` so the chat UI can badge the
// restricted treatment in real time (task 2), and — because a redaction is a
// SUCCESS, never an error — nothing here ever marks the result is_error, so the
// model explains the restriction instead of retrying it (task 3).

/**
 * Pull `extensions.governance.redactedFields` out of a query-graphql tool
 * result's text. Returns a de-duped, first-seen-order array of `Type.field`
 * coordinate strings, or [] when the result carries no governance signal (the
 * overwhelmingly common case). Tolerant of surrounding prose: mcp-graphql's
 * success path is pure JSON, but a defensive substring parse keeps a wrapped
 * payload working.
 *
 * @param {string} resultText  the flattened text of an MCP tool result
 * @returns {string[]}
 */
export function extractRedactedFields(resultText) {
  // Cheap reject before any parse: the vast majority of results carry no
  // governance and this runs on every tool call.
  if (typeof resultText !== 'string' || !resultText.includes('redactedFields')) return []

  const parsed = parseJsonLoose(resultText)
  const fields = parsed?.extensions?.governance?.redactedFields
  if (!Array.isArray(fields)) return []

  const seen = new Set()
  const out = []
  for (const field of fields) {
    if (typeof field === 'string' && field.length > 0 && !seen.has(field)) {
      seen.add(field)
      out.push(field)
    }
  }
  return out
}

// mcp-graphql prefixes nothing on its success path, so JSON.parse handles the
// normal case; the substring fallback recovers the object if a future version
// (or the error path's "…: <json>") wraps it in prose.
function parseJsonLoose(text) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}
