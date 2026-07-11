// First-run / empty conversation (DES-7): greeting + three static example
// prompts (fixed strings chosen in the design spec); clicking one sends it.
export const EXAMPLE_PROMPTS = [
  'What are the highest-rated 90s sci-fi movies?',
  'Which directors have the most titles this decade?',
  'Who acted in both Heat and The Godfather?',
];

export default function EmptyChat({ onPrompt }) {
  return (
    <div className="chat-empty">
      <p className="chat-empty__greeting">Ask anything about the data — it answers with live queries.</p>
      <div className="chat-empty__prompts">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" className="chat-empty__prompt" onClick={() => onPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
