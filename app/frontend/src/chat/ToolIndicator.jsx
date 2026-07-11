// One line per `tool` SSE event: the contract sends only the tool name, so the
// UI can say "querying the graph…" (DES-7 / architecture) without ever seeing
// query internals.
const LABELS = {
  'introspect-schema': 'Reading the graph schema…',
  'query-graphql': 'Querying the graph…',
};

export default function ToolIndicator({ name }) {
  return (
    <p className="chat-tool" data-tool={name}>
      <span className="chat-tool__spark" aria-hidden="true" />
      {LABELS[name] ?? `Running ${name}…`}
    </p>
  );
}
