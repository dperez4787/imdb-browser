/**
 * The concierge behaviors from DES-7, driven through the real components
 * (ChatProvider + ChatToggle + ChatPanel) with chatApi faked at its module
 * seam — each test hand-drives the stream callbacks (onText/onTool) and the
 * terminal outcome exactly as the SSE contract would deliver them.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../AuthContext.jsx';
import ChatPanel from './ChatPanel.jsx';
import { ChatProvider } from './ChatProvider.jsx';
import ChatToggle from './ChatToggle.jsx';
import { sendChat } from './chatApi.js';

vi.mock('../auth.js', () => ({
  subscribeToAuth: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  getIdToken: vi.fn(),
}));

vi.mock('./chatApi.js', () => ({
  sendChat: vi.fn(),
}));

import { subscribeToAuth } from '../auth.js';

const user = { uid: 'u1', displayName: 'Danny Perez', email: 'danny@example.com' };

let emitAuth;
let exchanges; // every sendChat call: { messages, onText, onTool, resolve, reject }

beforeEach(() => {
  vi.clearAllMocks();
  exchanges = [];
  subscribeToAuth.mockImplementation((listener) => {
    emitAuth = listener;
    return () => {};
  });
  sendChat.mockImplementation(
    (opts) =>
      new Promise((resolve, reject) => {
        exchanges.push({ ...opts, resolve, reject });
      }),
  );
});

function Harness() {
  return (
    <AuthProvider>
      <ChatProvider>
        <header>
          <ChatToggle />
        </header>
        <ChatPanel />
      </ChatProvider>
    </AuthProvider>
  );
}

function renderSignedIn() {
  const view = render(<Harness />);
  act(() => emitAuth(user));
  return view;
}

// Exact name: 'Close concierge' (panel header) and 'Concierge — new reply'
// (unread) are different accessible names.
const toggle = () => screen.getByRole('button', { name: 'Concierge' });
const composer = () => screen.getByRole('textbox', { name: 'Ask about the data' });
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const last = () => exchanges[exchanges.length - 1];

async function sendMessage(text) {
  fireEvent.change(composer(), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(composer(), { key: 'Enter' });
  });
}

describe('open/close and keyboard affordances', () => {
  it('opens from the TopBar toggle into the designed empty state, composer focused', () => {
    renderSignedIn();
    expect(screen.queryByRole('complementary', { name: 'Concierge' })).toBeNull();

    fireEvent.click(toggle());

    expect(screen.getByRole('complementary', { name: 'Concierge' })).toBeVisible();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    // Empty / first-run state: greeting + the three example prompts.
    expect(screen.getByText(/ask anything about the data/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'What are the highest-rated 90s sci-fi movies?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Which directors have the most titles this decade?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Who acted in both Heat and The Godfather?' })).toBeVisible();
    expect(composer()).toHaveFocus();
  });

  it('Esc inside the panel closes it and returns focus to the toggle', () => {
    renderSignedIn();
    fireEvent.click(toggle());

    fireEvent.keyDown(composer(), { key: 'Escape' });

    expect(screen.queryByRole('complementary', { name: 'Concierge' })).toBeNull();
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('Cmd/Ctrl+/ toggles the panel from anywhere', () => {
    renderSignedIn();

    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(screen.getByRole('complementary', { name: 'Concierge' })).toBeVisible();

    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.queryByRole('complementary', { name: 'Concierge' })).toBeNull();
  });
});

describe('sending and streamed rendering (the contract streams)', () => {
  it('clicking an example prompt sends it as the user message', async () => {
    renderSignedIn();
    fireEvent.click(toggle());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Who acted in both Heat and The Godfather?' }));
    });

    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(last().messages).toEqual([{ role: 'user', content: 'Who acted in both Heat and The Godfather?' }]);
    expect(screen.getByText('Who acted in both Heat and The Godfather?')).toBeVisible();
  });

  it('shows the typing shimmer before the first delta, then progressive text with the caret, tool lines in stream order, and the committed answer on done', async () => {
    const { container } = renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('Which 70s crime films rate above 9?');

    // Optimistic user message + in-flight shimmer (also the whole treatment
    // for a non-streaming transport, per DES-7).
    expect(screen.getByText('Which 70s crime films rate above 9?')).toBeVisible();
    expect(screen.getByRole('status', { name: /the concierge is answering/i })).toBeInTheDocument();

    // A tool event → the indicator line, still no text.
    await act(async () => last().onTool('query-graphql'));
    expect(screen.getByText('Querying the graph…')).toBeVisible();
    expect(screen.getByRole('status', { name: /answering/i })).toBeInTheDocument();

    // Streaming text renders progressively with the caret.
    await act(async () => last().onText('Two stand out: '));
    expect(screen.getByText(/two stand out:/i)).toBeVisible();
    expect(container.querySelector('.chat-caret')).not.toBeNull();
    expect(screen.queryByRole('status', { name: /answering/i })).toBeNull();

    await act(async () => last().onText('**The Godfather** (1972).'));
    // Markdown: bold renders as <strong>, sanitized React elements.
    expect(screen.getByText('The Godfather').tagName).toBe('STRONG');

    // done → the answer commits; caret and tool line are gone.
    await act(async () => last().resolve({ usage: { input_tokens: 1, output_tokens: 2 } }));
    expect(screen.getByText(/\(1972\)\./)).toBeVisible();
    expect(container.querySelector('.chat-caret')).toBeNull();
    expect(screen.queryByText('Querying the graph…')).toBeNull();
    expect(screen.queryByRole('status', { name: /answering/i })).toBeNull();
  });

  it('disables send while a reply is in flight — one exchange at a time, never queued', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('first question');

    expect(sendButton()).toBeDisabled();
    fireEvent.change(composer(), { target: { value: 'second question' } });
    expect(sendButton()).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(composer(), { key: 'Enter' });
    });
    expect(sendChat).toHaveBeenCalledTimes(1);

    await act(async () => {
      last().onText('answer');
      last().resolve({ usage: {} });
    });
    expect(sendButton()).toBeEnabled();
  });

  it('Shift+Enter adds a newline instead of sending', async () => {
    renderSignedIn();
    fireEvent.click(toggle());

    fireEvent.change(composer(), { target: { value: 'line one' } });
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
    expect(sendChat).not.toHaveBeenCalled();
  });

  it('re-sends the client-held history on the next exchange (stateless backend)', async () => {
    renderSignedIn();
    fireEvent.click(toggle());

    await sendMessage('first question');
    await act(async () => {
      last().onText('first answer');
      last().resolve({ usage: {} });
    });

    await sendMessage('follow-up');
    expect(sendChat).toHaveBeenCalledTimes(2);
    expect(last().messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow-up' },
    ]);
  });

  it('⟳ New chat clears the conversation back to the empty state in one click', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('a question');
    await act(async () => {
      last().onText('an answer');
      last().resolve({ usage: {} });
    });

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.queryByText('a question')).toBeNull();
    expect(screen.queryByText('an answer')).toBeNull();
    expect(screen.getByText(/ask anything about the data/i)).toBeVisible();
  });
});

describe('error and auth-rejection states', () => {
  const reject = (kind, message) => {
    const err = new Error(message);
    err.kind = kind;
    return err;
  };

  it('a backend error renders the designed error state; Retry re-sends the SAME message and replaces the failed exchange', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('a question');

    await act(async () => last().onText('partial that will be discarded'));
    await act(async () => last().reject(reject('upstream', 'Something went wrong while answering.')));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/the concierge couldn’t answer\./i);
    expect(screen.queryByText(/partial that will be discarded/)).toBeNull();

    // Retry: same history, no duplicated user message.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });
    expect(sendChat).toHaveBeenCalledTimes(2);
    expect(last().messages).toEqual([{ role: 'user', content: 'a question' }]);
    expect(screen.getAllByText('a question')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull(); // the failed slot was replaced

    await act(async () => {
      last().onText('the real answer');
      last().resolve({ usage: {} });
    });
    expect(screen.getByText('the real answer')).toBeVisible();
  });

  it('surfaces the friendly rate-limit message with a Retry path', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('too fast');
    await act(async () =>
      last().reject(reject('rate-limited', "You're sending messages too quickly — wait a minute and try again.")),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/too quickly/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('an auth rejection renders the session-expired state: no Retry, composer disabled', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('a question');
    await act(async () => last().reject(reject('auth', 'Your session expired.')));

    expect(screen.getByRole('alert')).toHaveTextContent(/your session expired\. sign in again to keep chatting\./i);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(composer()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it('after re-auth, the failed exchange retries automatically and a success re-enables the composer', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('a question');
    await act(async () => last().reject(reject('auth', 'Your session expired.')));
    expect(composer()).toBeDisabled();

    // AuthGate handles the actual re-sign-in; a fresh user object arrives.
    await act(async () => emitAuth({ ...user }));

    expect(sendChat).toHaveBeenCalledTimes(2);
    expect(last().messages).toEqual([{ role: 'user', content: 'a question' }]);
    await act(async () => {
      last().onText('welcome back');
      last().resolve({ usage: {} });
    });
    expect(composer()).toBeEnabled();
    expect(screen.getByText('welcome back')).toBeVisible();
  });
});

describe('unread dot on the toggle', () => {
  it('marks the toggle when a reply lands while the panel is closed, and clears on open', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('slow question');

    // Close the panel while the reply streams.
    fireEvent.keyDown(composer(), { key: 'Escape' });
    await act(async () => {
      last().onText('late reply');
      last().resolve({ usage: {} });
    });

    expect(screen.getByRole('button', { name: 'Concierge — new reply' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Concierge — new reply' }));
    expect(screen.getByRole('button', { name: 'Concierge' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('late reply')).toBeVisible();
  });
});

describe('conversation persistence (panel closed ≠ conversation lost)', () => {
  it('keeps the conversation when the panel closes and reopens', async () => {
    renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('remember me');
    await act(async () => {
      last().onText('of course');
      last().resolve({ usage: {} });
    });

    fireEvent.keyDown(composer(), { key: 'Escape' });
    fireEvent.click(toggle());

    expect(screen.getByText('remember me')).toBeVisible();
    expect(screen.getByText('of course')).toBeVisible();
  });
});

describe('streamed governance badge (IMDB-16 / DES-7 addendum)', () => {
  const badges = (container) => container.querySelectorAll('.chat-governance');
  const badge = (container) => container.querySelector('.chat-governance');

  it('absent → appears mid-stream on the first redacted tool event → grows in place → persists on commit', async () => {
    const { container } = renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('how many votes does Game of Thrones have?');

    // Absent: no governance yet, no badge, no reserved space.
    expect(badges(container)).toHaveLength(0);

    // First redacted tool event → the badge appears NOW, foot of the still-empty
    // draft message, before any answer text.
    await act(async () => last().onTool('query-graphql', { redactedFields: ['Rating.numVotes'] }));
    expect(badges(container)).toHaveLength(1);
    expect(badge(container)).toHaveAttribute('data-coordinates', 'Rating.numVotes');

    // Text streams above it; the badge stays.
    await act(async () => last().onText('The Godfather averages 9.2 stars; vote counts are restricted for your role.'));
    expect(badges(container)).toHaveLength(1);

    // A second redacted tool call grows the SAME badge's list in place — never a
    // second badge, deduped union in first-seen order.
    await act(async () =>
      last().onTool('query-graphql', { redactedFields: ['Rating.numVotes', 'Name.birthYear'] }),
    );
    expect(badges(container)).toHaveLength(1);
    expect(badge(container)).toHaveAttribute('data-coordinates', 'Rating.numVotes,Name.birthYear');

    // Commit: the badge persists as the committed message's last line (tool
    // lines and caret drop).
    await act(async () => last().resolve({ usage: {} }));
    expect(badges(container)).toHaveLength(1);
    expect(badge(container)).toHaveAttribute('data-coordinates', 'Rating.numVotes,Name.birthYear');
    expect(container.querySelector('.chat-caret')).toBeNull();
    expect(screen.queryByText('Querying the graph…')).toBeNull();
  });

  it('a message whose tool calls carry no governance renders no badge and reserves no space', async () => {
    const { container } = renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('what is the title of tt0111161?');

    await act(async () => last().onTool('query-graphql'));
    await act(async () => last().onText('The Shawshank Redemption.'));
    await act(async () => last().resolve({ usage: {} }));

    expect(badges(container)).toHaveLength(0);
    expect(screen.getByText('The Shawshank Redemption.')).toBeVisible();
  });

  it('discards the badge with the failed draft on error (never orphaned)', async () => {
    const { container } = renderSignedIn();
    fireEvent.click(toggle());
    await sendMessage('votes?');

    await act(async () => last().onTool('query-graphql', { redactedFields: ['Rating.numVotes'] }));
    expect(badges(container)).toHaveLength(1);

    const err = new Error('Something went wrong while answering.');
    err.kind = 'upstream';
    await act(async () => last().reject(err));

    // The draft (and its badge) are discarded; the error notice replaces them.
    expect(badges(container)).toHaveLength(0);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
