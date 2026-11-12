import { MessageSender } from "./message-sender";
import { useEffect, useState } from "react";
import { ApiError, useChatTransport } from "./transport";
import type { Message, Page } from "./types";

export function MessageReplies({
  path,
  memberId,
}: {
  path: string;
  memberId: string;
}) {
  const api = useChatTransport();
  const [page, setPage] = useState<{ items: Message[]; hasMore: boolean }>();
  const [before, setBefore] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let canceled = false;
    api<Page>(before ? `${path}&before=${encodeURIComponent(before)}` : path)
      .then(({ items, hasMore }) => {
        if (canceled) return;
        setPage((previous) => ({
          items: before ? [...items, ...(previous?.items ?? [])] : items,
          hasMore,
        }));
      })
      .catch((error: Error) => {
        if (canceled) return;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status))
          setPage(undefined);
        setError(error.message);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, path, before, retry]);

  return (
    <div
      className="chat-thread-messages"
      role="log"
      aria-label="Replies to this message"
      tabIndex={0}
    >
      {loading && (
        <p className="helper" role="status">
          Loading replies…
        </p>
      )}
      {error && (
        <div role="alert">
          <p className="helper">{error}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && page?.hasMore && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setLoading(true);
            setBefore(page.items[0].id);
          }}
        >
          Load earlier replies
        </button>
      )}
      {page?.items.map((message) => (
        <article className="chat-thread-message" key={message.id}>
          <MessageSender message={message} memberId={memberId} />
          <p>{message.body}</p>
        </article>
      ))}
      {!loading && !error && page?.items.length === 0 && (
        <p className="helper">No replies yet.</p>
      )}
    </div>
  );
}
