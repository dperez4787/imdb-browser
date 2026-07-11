// Server-Sent Events framing for POST /api/chat. The SPA consumes the stream
// with fetch + ReadableStream (no EventSource), but the wire format is standard
// SSE: `event: <name>\ndata: <json>\n\n`.

// Starts the SSE response. `status` is 200 for a normal stream; the rate-limit
// path uses 429 with a single friendly `error` event, per the contract.
export function sseStart(res, status = 200) {
  res.status(status)
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
}

export function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
