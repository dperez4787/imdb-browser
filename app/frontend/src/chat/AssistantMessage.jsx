import GovernanceBadge from './GovernanceBadge.jsx';
import { renderMarkdown } from './markdown.jsx';

// Assistant message (DES-7): left, no bubble — plain markdown on the surface
// (the assistant is the room). While streaming, a caret ▍ marks the live end.
// When the message's tool calls were governance-redacted, GovernanceBadge is the
// message's LAST line (DES-7 addendum, IMDB-16); `governance` null → no badge,
// no DOM.
export default function AssistantMessage({ content, streaming = false, governance = null }) {
  return (
    <div className="chat-msg chat-msg--assistant" data-role="assistant">
      {renderMarkdown(content)}
      {streaming && (
        <span className="chat-caret" aria-hidden="true">
          ▍
        </span>
      )}
      {governance?.redactedFields?.length ? (
        <GovernanceBadge redactedFields={governance.redactedFields} />
      ) : null}
    </div>
  );
}
