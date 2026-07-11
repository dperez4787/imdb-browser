import { renderMarkdown } from './markdown.jsx';

// Assistant message (DES-7): left, no bubble — plain markdown on the surface
// (the assistant is the room). While streaming, a caret ▍ marks the live end.
export default function AssistantMessage({ content, streaming = false }) {
  return (
    <div className="chat-msg chat-msg--assistant" data-role="assistant">
      {renderMarkdown(content)}
      {streaming && (
        <span className="chat-caret" aria-hidden="true">
          ▍
        </span>
      )}
    </div>
  );
}
