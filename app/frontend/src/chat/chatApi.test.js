/**
 * chatApi is the frontend's half of the IMDB-10 wire contract, so these tests
 * exercise the real parser against synthetic ReadableStreams: all four event
 * types (text/tool/done/error), frames split across arbitrary chunk
 * boundaries, malformed frames, mid-stream errors, the pre-stream HTTP
 * rejections, and the 20-message/16 KB history caps. Only the auth boundary
 * and global fetch are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from '../auth.js';
import {
  capHistory,
  ChatApiError,
  consumeSse,
  MAX_BODY_BYTES,
  MAX_HISTORY_MESSAGES,
  sendChat,
} from './chatApi.js';

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(),
}));

/** A ReadableStream of UTF-8 chunks, like res.body. */
function streamOf(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseResponse(chunks, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: streamOf(chunks),
  };
}

function jsonResponse(status, payload = {}) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
    json: async () => payload,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  getIdToken.mockResolvedValue('id-token-123');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const userMsg = (content = 'Which 70s crime films rate above 9?') => ({ role: 'user', content });

describe('consumeSse — the four contract event types', () => {
  it('dispatches text deltas in order and resolves with usage on done', async () => {
    const onText = vi.fn();
    const onTool = vi.fn();
    const result = await consumeSse(
      streamOf([
        frame('text', { delta: 'Two stand out: ' }),
        frame('text', { delta: 'The Godfather (1972).' }),
        frame('done', { usage: { input_tokens: 10, output_tokens: 20 } }),
      ]),
      { onText, onTool },
    );

    expect(onText.mock.calls.map(([d]) => d)).toEqual(['Two stand out: ', 'The Godfather (1972).']);
    expect(onTool).not.toHaveBeenCalled();
    expect(result).toEqual({ usage: { input_tokens: 10, output_tokens: 20 } });
  });

  it('dispatches tool events by name', async () => {
    const onTool = vi.fn();
    await consumeSse(
      streamOf([
        frame('tool', { name: 'introspect-schema' }),
        frame('tool', { name: 'query-graphql' }),
        frame('done', { usage: {} }),
      ]),
      { onTool },
    );

    expect(onTool.mock.calls.map(([n]) => n)).toEqual(['introspect-schema', 'query-graphql']);
  });

  it('forwards governance.redactedFields on the tool event, undefined when absent (IMDB-16)', async () => {
    const onTool = vi.fn();
    await consumeSse(
      streamOf([
        frame('tool', { name: 'query-graphql', governance: { redactedFields: ['Rating.numVotes'] } }),
        frame('tool', { name: 'query-graphql' }),
        frame('done', { usage: {} }),
      ]),
      { onTool },
    );

    expect(onTool.mock.calls).toEqual([
      ['query-graphql', { redactedFields: ['Rating.numVotes'] }],
      ['query-graphql', undefined],
    ]);
  });

  it('rejects with the server error kind/message on an error event, keeping earlier text', async () => {
    const onText = vi.fn();
    const promise = consumeSse(
      streamOf([
        frame('text', { delta: 'Let me check' }),
        frame('error', { kind: 'upstream', message: 'Something went wrong while answering.' }),
      ]),
      { onText },
    );

    await expect(promise).rejects.toMatchObject({
      name: 'ChatApiError',
      kind: 'upstream',
      message: 'Something went wrong while answering.',
    });
    expect(onText).toHaveBeenCalledWith('Let me check'); // mid-stream error, after partial text
  });

  it('stops delivering events after the terminal done', async () => {
    const onText = vi.fn();
    await consumeSse(
      streamOf([frame('done', { usage: {} }), frame('text', { delta: 'late' })]),
      { onText },
    );
    expect(onText).not.toHaveBeenCalled();
  });
});

describe('consumeSse — robustness', () => {
  it('parses frames split across arbitrary chunk boundaries', async () => {
    const whole = frame('text', { delta: 'Hello ' }) + frame('text', { delta: 'world' }) + frame('done', { usage: {} });
    // Split every 7 bytes — boundaries land mid-line, mid-JSON, mid-separator.
    const chunks = [];
    for (let i = 0; i < whole.length; i += 7) chunks.push(whole.slice(i, i + 7));

    const onText = vi.fn();
    await consumeSse(streamOf(chunks), { onText });
    expect(onText.mock.calls.map(([d]) => d)).toEqual(['Hello ', 'world']);
  });

  it('tolerates CRLF line endings', async () => {
    const onText = vi.fn();
    await consumeSse(
      streamOf(['event: text\r\ndata: {"delta":"crlf"}\r\n\r\n', frame('done', { usage: {} })]),
      { onText },
    );
    expect(onText).toHaveBeenCalledWith('crlf');
  });

  it('skips malformed frames (bad JSON, no data, unknown events, comments) and keeps going', async () => {
    const onText = vi.fn();
    const result = await consumeSse(
      streamOf([
        'event: text\ndata: {not json at all\n\n', // malformed JSON
        'event: text\n\n', // no data line
        ': heartbeat comment\n\n', // SSE comment
        frame('confetti', { delta: 'nope' }), // unknown event type
        frame('text', { delta: 'still alive' }),
        frame('done', { usage: { output_tokens: 1 } }),
      ]),
      { onText },
    );

    expect(onText.mock.calls.map(([d]) => d)).toEqual(['still alive']);
    expect(result.usage).toEqual({ output_tokens: 1 });
  });

  it('rejects kind "stream" when the connection ends without done or error', async () => {
    const promise = consumeSse(streamOf([frame('text', { delta: 'cut off mid-' })]), {});
    await expect(promise).rejects.toMatchObject({ name: 'ChatApiError', kind: 'stream' });
  });
});

describe('sendChat — request shape and pre-stream rejections', () => {
  it('POSTs the capped history to the VITE_CHAT_URL default with the ID token from the auth boundary attached', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame('done', { usage: {} })]));

    await sendChat({ messages: [userMsg('hi')] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/chat');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer id-token-123');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'hi' }] });
  });

  it('throws kind "auth" without any network request when nobody is signed in', async () => {
    getIdToken.mockResolvedValue(null);
    await expect(sendChat({ messages: [userMsg()] })).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 401 rejection (expired/invalid token) to kind "auth"', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: 'Invalid or expired token' } }));
    await expect(sendChat({ messages: [userMsg()] })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps other HTTP failures (e.g. 500) to kind "http"', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));
    await expect(sendChat({ messages: [userMsg()] })).rejects.toMatchObject({ kind: 'http' });
  });

  it('surfaces the friendly error event from the 429 rate-limit stream', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        [frame('error', { kind: 'rate-limited', message: "You're sending messages too quickly — wait a minute and try again." })],
        429,
      ),
    );
    await expect(sendChat({ messages: [userMsg()] })).rejects.toMatchObject({
      kind: 'rate-limited',
      message: expect.stringMatching(/too quickly/),
    });
  });

  it('maps a network-level failure to kind "network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendChat({ messages: [userMsg()] })).rejects.toMatchObject({ kind: 'network' });
  });

  it('lets an abort propagate as AbortError, not a ChatApiError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abortError);
    await expect(sendChat({ messages: [userMsg()], signal: new AbortController().signal })).rejects.toBe(abortError);
  });
});

describe('capHistory — the contract caps, enforced client-side', () => {
  const msg = (i, role = i % 2 === 0 ? 'user' : 'assistant') => ({ role, content: `message ${i}` });

  it('passes short histories through untouched (roles + content only)', () => {
    const history = [
      { role: 'user', content: 'a', id: 'x1' },
      { role: 'assistant', content: 'b', id: 'x2' },
      { role: 'user', content: 'c', id: 'x3' },
    ];
    expect(capHistory(history)).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
  });

  it(`keeps only the newest ${MAX_HISTORY_MESSAGES} messages`, () => {
    const history = Array.from({ length: 30 }, (_, i) => msg(i));
    const capped = capHistory(history);
    expect(capped).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(capped[capped.length - 1]).toEqual({ role: 'assistant', content: 'message 29' });
    expect(capped[0]).toEqual({ role: 'user', content: 'message 10' });
  });

  it(`trims oldest-first to stay under the ${MAX_BODY_BYTES}-byte body cap`, () => {
    const big = 'x'.repeat(8 * 1024);
    const history = [
      { role: 'user', content: big },
      { role: 'assistant', content: big },
      { role: 'user', content: 'and one more question' },
    ];
    const capped = capHistory(history);
    // The oldest big message no longer fits alongside the other two.
    expect(capped).toHaveLength(2);
    expect(capped[0].role).toBe('assistant');
    expect(capped[1].content).toBe('and one more question');
    expect(new TextEncoder().encode(JSON.stringify({ messages: capped })).length).toBeLessThanOrEqual(
      MAX_BODY_BYTES,
    );
  });

  it('always keeps the newest message, even alone over the cap (server 413 handles it)', () => {
    const huge = 'y'.repeat(20 * 1024);
    const capped = capHistory([msg(0), { role: 'user', content: huge }]);
    expect(capped).toEqual([{ role: 'user', content: huge }]);
  });

  it('throws ChatApiError instances whose kind the UI can branch on', () => {
    const err = new ChatApiError('upstream', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe('upstream');
  });
});
