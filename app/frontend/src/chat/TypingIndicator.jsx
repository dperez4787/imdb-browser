// Three-dot shimmer (DES-7): the in-flight assistant slot before any streamed
// text arrives — which is also the whole in-flight treatment if a future
// transport doesn't stream.
export default function TypingIndicator() {
  return (
    <div className="chat-typing" role="status" aria-label="The concierge is answering">
      <span />
      <span />
      <span />
    </div>
  );
}
