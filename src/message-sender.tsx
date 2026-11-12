import type { Message } from "./types";

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

export function MessageSender({
  message,
  memberId,
}: {
  message: Message;
  memberId: string;
}) {
  return (
    <strong className="chat-sender">
      <span className="chat-sender-avatar" aria-hidden="true">
        {initials(message.author)}
      </span>
      {message.member_id === memberId ? "You" : message.author}
    </strong>
  );
}
