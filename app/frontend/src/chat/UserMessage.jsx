// User bubble (DES-7): right-aligned raised card — the user is the guest.
export default function UserMessage({ content }) {
  return (
    <div className="chat-msg chat-msg--user" data-role="user">
      {content}
    </div>
  );
}
