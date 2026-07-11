/**
 * IMDB-11 tester acceptance tests — the SSE boundary (chatApi.consumeSse),
 * written independently of the developer's chatApi.test.js against the wire
 * contract in docs/architecture.md ("Chat backend API contract"):
 *
 *   text {delta} · tool {name} · done {usage} · error {kind, message}
 *
 * Each test feeds a synthetic ReadableStream of raw bytes, exactly what the
 * network hands the parser: well-formed frames, malformed frames, frames
 * split across arbitrary chunk boundaries (including mid-UTF-8-character),
 * and early termination without a terminal event.
 */
import { describe, expect, it } from 'vitest';

import { ChatApiError, consumeSse } from './chatApi.js';

const encoder = new TextEncoder();

/** A ReadableStream that emits each string (or Uint8Array) as one chunk. */
function streamOf(...chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Collect dispatched events in arrival order. */
function recorder() {
  const seen = [];
  return {
    seen,
    onText: (delta) => seen.push(['text', delta]),
    onTool: (name) => seen.push(['tool', name]),
  };
}

describe('IMDB-11 tester: well-formed streams', () => {
  it('dispatches text and tool events in exact stream order and resolves with usage on done', async () => {
    const rec = recorder();
    const result = await consumeSse(
      streamOf(
        frame('tool', { name: 'introspect-schema' }),
        frame('text', { delta: 'Two stand out: ' }),
        frame('tool', { name: 'query-graphql' }),
        frame('text', { delta: 'The Godfather (1972)' }),
        frame('done', { usage: { input_tokens: 120, output_tokens: 45 } }),
      ),
      rec,
    );

    expect(rec.seen).toEqual([
      ['tool', 'introspect-schema'],
      ['text', 'Two stand out: '],
      ['tool', 'query-graphql'],
      ['text', 'The Godfather (1972)'],
    ]);
    expect(result).toEqual({ usage: { input_tokens: 120, output_tokens: 45 } });
  });

  it('a whole conversation in one chunk parses identically to one frame per chunk', async () => {
    const frames = [
      frame('text', { delta: 'a' }),
      frame('text', { delta: 'b' }),
      frame('done', { usage: {} }),
    ];
    const one = recorder();
    await consumeSse(streamOf(frames.join('')), one);
    const many = recorder();
    await consumeSse(streamOf(...frames), many);
    expect(one.seen).toEqual(many.seen);
    expect(one.seen).toEqual([
      ['text', 'a'],
      ['text', 'b'],
    ]);
  });
});

describe('IMDB-11 tester: split-across-chunks frames', () => {
  it('reassembles a frame split at every possible byte boundary', async () => {
    const wire = frame('text', { delta: 'hi' }) + frame('done', { usage: {} });
    const bytes = encoder.encode(wire);
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const rec = recorder();
      await consumeSse(streamOf(bytes.slice(0, cut), bytes.slice(cut)), rec);
      expect(rec.seen, `split at byte ${cut}`).toEqual([['text', 'hi']]);
    }
  });

  it('survives a chunk boundary inside a multi-byte UTF-8 character', async () => {
    // '★' is 3 bytes in UTF-8; cut in the middle of it.
    const wire = encoder.encode(frame('text', { delta: '★9.2' }) + frame('done', { usage: {} }));
    const starStart = wire.findIndex((b) => b === 0xe2); // first byte of ★
    const rec = recorder();
    await consumeSse(streamOf(wire.slice(0, starStart + 1), wire.slice(starStart + 1)), rec);
    expect(rec.seen).toEqual([['text', '★9.2']]);
  });

  it('tolerates CRLF frame delimiters', async () => {
    const rec = recorder();
    await consumeSse(
      streamOf('event: text\r\ndata: {"delta":"ok"}\r\n\r\nevent: done\r\ndata: {"usage":{}}\r\n\r\n'),
      rec,
    );
    expect(rec.seen).toEqual([['text', 'ok']]);
  });
});

describe('IMDB-11 tester: malformed frames', () => {
  it('skips bad-JSON, data-less, unknown-event, comment and wrong-shape frames without killing the stream', async () => {
    const rec = recorder();
    const result = await consumeSse(
      streamOf(
        'event: text\ndata: {not json\n\n', // invalid JSON payload
        'event: text\n\n', // no data line at all
        ': keep-alive comment\n\n', // SSE comment frame
        frame('poster', { url: 'x' }), // event name outside the contract
        frame('text', { delta: 42 }), // delta not a string
        frame('tool', {}), // tool with no name
        frame('text', { delta: 'still alive' }),
        frame('done', { usage: { input_tokens: 1, output_tokens: 1 } }),
      ),
      rec,
    );
    expect(rec.seen).toEqual([['text', 'still alive']]);
    expect(result.usage).toEqual({ input_tokens: 1, output_tokens: 1 });
  });

  it('a mid-stream error event rejects with the server-sent kind and message, after earlier deltas were delivered', async () => {
    const rec = recorder();
    const failure = await consumeSse(
      streamOf(
        frame('text', { delta: 'partial ' }),
        frame('error', { kind: 'rate-limited', message: 'Take a breath — try again in a minute.' }),
      ),
      rec,
    ).then(
      () => null,
      (err) => err,
    );
    expect(rec.seen).toEqual([['text', 'partial ']]);
    expect(failure).toBeInstanceOf(ChatApiError);
    expect(failure.kind).toBe('rate-limited');
    expect(failure.message).toBe('Take a breath — try again in a minute.');
  });

  it('an error event missing kind/message still rejects with a usable default', async () => {
    const failure = await consumeSse(streamOf('event: error\ndata: {}\n\n'), recorder()).then(
      () => null,
      (err) => err,
    );
    expect(failure).toBeInstanceOf(ChatApiError);
    expect(failure.kind).toBe('upstream');
    expect(failure.message.length).toBeGreaterThan(0);
  });
});

describe('IMDB-11 tester: early termination', () => {
  it('a stream that closes without done/error rejects as an interruption (kind "stream")', async () => {
    const rec = recorder();
    const failure = await consumeSse(
      streamOf(frame('text', { delta: 'and then the connec' })),
      rec,
    ).then(
      () => null,
      (err) => err,
    );
    expect(rec.seen).toEqual([['text', 'and then the connec']]);
    expect(failure).toBeInstanceOf(ChatApiError);
    expect(failure.kind).toBe('stream');
  });

  it('an entirely empty stream rejects the same way rather than resolving', async () => {
    const failure = await consumeSse(streamOf(), recorder()).then(
      () => null,
      (err) => err,
    );
    expect(failure).toBeInstanceOf(ChatApiError);
    expect(failure.kind).toBe('stream');
  });
});
