/**
 * IMDB-11 tester acceptance tests — the concierge UI against DES-7's states,
 * written independently of the developer's ChatPanel.test.jsx. chatApi is
 * faked at its module seam (the sanctioned network boundary); each test
 * drives onText/onTool and the terminal outcome exactly as the SSE contract
 * delivers them, through the REAL AppShell composition (TopBar + ChatProvider
 * + ChatPanel) so the reflow layout structure is what's under test too.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '../AppShell.jsx';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { subscribeToAuth } from '../auth.js';
import { sendChat } from './chatApi.js';
import { EXAMPLE_PROMPTS } from './EmptyChat.jsx';

vi.mock('../auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

vi.mock('./chatApi.js', () => ({
  sendChat: vi.fn(),
}));

let calls; // one entry per sendChat call: { messages, onText, onTool, resolve, reject }

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  // AppShell sits INSIDE the AuthGate in the real app, so it may assume a
  // signed-in user: emit one synchronously on subscribe.
  subscribeToAuth.mockImplementation((listener) => {
    listener({ uid: 'tester', displayName: 'Tester', email: 't@example.com' });
    return () => {};
  });
  sendChat.mockImplementation(
    (opts) =>
      new Promise((resolve, reject) => {
        calls.push({ ...opts, resolve, reject });
      }),
  );
});

// AppShell only ever mounts behind the real AuthGate (signed in); this
// mirrors that contract without dragging the sign-in screen into these tests.
function SignedInOnly({ children }) {
  const { user } = useAuth();
  return user ? children : null;
}

function renderShellSignedIn() {
  return render(
    <AuthProvider>
      <SignedInOnly>
        <AppShell>
          <p>the routed browsing view</p>
        </AppShell>
      </SignedInOnly>
    </AuthProvider>,
  );
}

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: 'Concierge' }));
const composer = () => screen.getByRole('textbox', { name: 'Ask about the data' });
const lastCall = () => calls[calls.length - 1];

async function ask(text) {
  fireEvent.change(composer(), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(composer(), { key: 'Enter' });
  });
}

const streamText = (delta) => act(() => lastCall().onText(delta));
const streamTool = (name) => act(() => lastCall().onTool(name));
const streamDone = (usage = {}) =>
  act(async () => {
    lastCall().resolve({ usage });
  });
const streamFail = (kind, message) =>
  act(async () => {
    const err = new Error(message);
    err.kind = kind;
    lastCall().reject(err);
  });

describe('IMDB-11 tester: empty / first-run state (DES-7)', () => {
  it('opening from the shell shows the greeting and exactly the three designed example prompts', () => {
    renderShellSignedIn();
    openPanel();

    expect(screen.getByText(/ask anything about the data/i)).toBeVisible();
    expect(EXAMPLE_PROMPTS).toHaveLength(3);
    for (const prompt of EXAMPLE_PROMPTS) {
      expect(screen.getByRole('button', { name: prompt })).toBeVisible();
    }
  });

  it('clicking an example prompt sends that exact string as the user message', async () => {
    renderShellSignedIn();
    openPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: EXAMPLE_PROMPTS[0] }));
    });

    expect(sendChat).toHaveBeenCalledTimes(1);
    const sent = lastCall().messages;
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: EXAMPLE_PROMPTS[0] });
    expect(screen.getByText(EXAMPLE_PROMPTS[0])).toBeVisible();
  });
});

describe('IMDB-11 tester: all four contract events render (DES-7 streaming treatment)', () => {
  it('shimmer before the first delta → tool lines interleaved in stream order → progressive text with caret → committed answer on done', async () => {
    renderShellSignedIn();
    openPanel();
    await ask('Which 70s crime films rate above 9?');

    // In-flight, nothing streamed yet: the three-dot shimmer.
    expect(screen.getByRole('status', { name: /answering/i })).toBeInTheDocument();

    // tool → the designed indicator line.
    streamTool('introspect-schema');
    expect(screen.getByText('Reading the graph schema…')).toBeVisible();

    // text → progressive text plus the streaming caret.
    streamText('Two stand out: ');
    expect(screen.getByText(/two stand out:/i)).toBeVisible();
    expect(document.querySelector('.chat-caret')).not.toBeNull();

    // A second tool call interleaves AFTER the text, in stream order.
    streamTool('query-graphql');
    const log = screen.getByRole('log');
    const rendered = Array.from(log.querySelectorAll('.chat-msg--assistant, .chat-tool')).map(
      (el) => el.textContent,
    );
    expect(rendered[0]).toContain('Reading the graph schema…');
    expect(rendered[1]).toContain('Two stand out:');
    expect(rendered[2]).toContain('Querying the graph…');

    streamText('The Godfather (1972).');

    // done → the answer commits, caret and shimmer gone, composer usable again.
    await streamDone({ input_tokens: 10, output_tokens: 20 });
    expect(screen.getByText(/the godfather \(1972\)/i)).toBeVisible();
    expect(document.querySelector('.chat-caret')).toBeNull();
    expect(screen.queryByRole('status', { name: /answering/i })).toBeNull();
    expect(composer()).toBeEnabled();
  });

  it('an error event mid-stream discards the torn draft and renders the designed error state; Retry replaces, never duplicates', async () => {
    renderShellSignedIn();
    openPanel();
    await ask('hello?');
    streamText('I was about to say');
    await streamFail('upstream', 'model fell over');

    // DES-7 backend-error state: headline + Retry, torn text gone.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/the concierge couldn’t answer\./i);
    expect(screen.queryByText(/i was about to say/i)).toBeNull();

    // Retry re-sends the SAME history — user message not duplicated.
    const firstHistory = lastCall().messages;
    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    });
    expect(sendChat).toHaveBeenCalledTimes(2);
    expect(lastCall().messages).toEqual(firstHistory);
    expect(screen.getAllByText('hello?')).toHaveLength(1);

    streamText('Recovered answer.');
    await streamDone();
    expect(screen.getByText('Recovered answer.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an auth rejection renders the session-expired state: no Retry button, composer disabled (DES-7)', async () => {
    renderShellSignedIn();
    openPanel();
    await ask('am I still signed in?');
    await streamFail('auth', 'Your session expired.');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/your session expired\. sign in again to keep chatting\./i);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(composer()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('IMDB-11 tester: docked panel reflows, never overlays (DES-7 desktop layout)', () => {
  it('mounts the panel as an in-flow sibling of the routed content inside the shell body — not a portal/overlay over it', () => {
    renderShellSignedIn();
    openPanel();

    const body = document.querySelector('.app-shell__body');
    const main = body?.querySelector(':scope > main.app-shell__main');
    const dock = body?.querySelector(':scope > .chat-dock');
    expect(main).not.toBeNull();
    expect(dock).not.toBeNull();
    // Same flex row, content first, dock after → the content reflows to the
    // remaining width; the panel cannot cover it at desktop widths.
    expect(main.nextElementSibling).toBe(dock);
    expect(screen.getByText('the routed browsing view')).toBeVisible();
  });

  it('the desktop (base) CSS keeps the dock in normal flow; fixed/absolute positioning exists only inside the <1080px media queries', () => {
    // jsdom doesn't lay out CSS, but the stylesheet's structure is checkable:
    // the base .chat-dock rule must not position:fixed/absolute; only the
    // narrow-width @media blocks may.
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'),
      'utf8',
    );
    // Split off @media blocks (brace-matched enough for this stylesheet's shape).
    const mediaBlocks = [...css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)];
    let base = css;
    for (const m of mediaBlocks) base = base.replace(m[0], '');

    const baseDock = base.match(/\.chat-dock\s*\{([^}]*)\}/)?.[1] ?? '';
    const basePanel = base.match(/\.chat-panel\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(baseDock).toContain('width: 380px');
    expect(baseDock).not.toMatch(/position:\s*(fixed|absolute)/);
    expect(basePanel).not.toMatch(/position:\s*(fixed|absolute)/);

    // The overlay treatment lives only under max-width media queries.
    const overlayBlocks = mediaBlocks.filter(([full]) => /position:\s*(fixed|absolute)/.test(full));
    for (const [full] of overlayBlocks.filter(([f]) => f.includes('.chat-dock') || f.includes('.chat-panel'))) {
      expect(full).toMatch(/@media\s*\(max-width:\s*(1079|719)px\)/);
    }
  });
});

describe('IMDB-11 tester: session history behavior (DES-7 history model)', () => {
  it('the next send re-sends the whole client-held history, newest last (stateless contract)', async () => {
    renderShellSignedIn();
    openPanel();
    await ask('first question');
    streamText('first answer');
    await streamDone();
    await ask('second question');

    expect(lastCall().messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second question' },
    ]);
  });

  it('New chat clears the conversation back to the empty state in one click', async () => {
    renderShellSignedIn();
    openPanel();
    await ask('soon to be forgotten');
    streamText('gone too');
    await streamDone();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText('soon to be forgotten')).toBeNull();
    expect(screen.getByText(/ask anything about the data/i)).toBeVisible();
  });
});
