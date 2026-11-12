import { useEffect, useRef, useState } from "react";
import { Pencil, Reply, Trash2, X } from "lucide-react";
import { useChatTransport } from "./transport";
import type { Message } from "./types";

export function MessageActions({
  message,
  anchor,
  canEdit,
  canDelete,
  spaceId,
  onClose,
  replyLabel,
  onReply,
  onViewReplies,
  onChanged,
}: {
  message: Message;
  anchor: HTMLElement;
  canEdit: boolean;
  canDelete: boolean;
  spaceId: string;
  onClose: () => void;
  replyLabel: string;
  onReply?: () => void;
  onViewReplies: () => void;
  onChanged: () => Promise<void>;
}) {
  const api = useChatTransport();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"edit" | "delete" | null>(null);
  const [original] = useState(message.body);
  const [body, setBody] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  useEffect(() => {
    if (action)
      dialog.current
        ?.querySelector<HTMLElement>("[data-action-focus]")
        ?.focus();
  }, [action]);
  const rect = anchor.getBoundingClientRect();

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const base = `/spaces/${encodeURIComponent(spaceId)}`;
      if (action === "edit")
        await api(
          `${base}/chat/${encodeURIComponent(message.id)}`,
          { body, previousBody: original },
          "PATCH",
        );
      else await api(`${base}/moderation`, { messageId: message.id });
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={
        action ? "chat-action-dialog" : "chat-action-dialog chat-action-popout"
      }
      style={
        action
          ? undefined
          : {
              left: Math.max(12, Math.min(rect.left, window.innerWidth - 212)),
              top: Math.max(
                12,
                Math.min(rect.bottom + 4, window.innerHeight - 196),
              ),
            }
      }
      aria-label={
        action === "edit"
          ? "Edit message"
          : action === "delete"
            ? "Delete message"
            : "Message actions"
      }
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {!action ? (
        <div className="chat-action-list">
          {onReply && (
            <button type="button" className="text-button" onClick={onReply}>
              <Reply size={17} aria-hidden="true" /> {replyLabel}
            </button>
          )}
          <button type="button" className="text-button" onClick={onViewReplies}>
            View replies
          </button>
          {canEdit && (
            <button
              type="button"
              className="text-button"
              onClick={() => setAction("edit")}
            >
              <Pencil size={17} aria-hidden="true" /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="text-button"
              onClick={() => setAction("delete")}
            >
              <Trash2 size={17} aria-hidden="true" /> Delete
            </button>
          )}
        </div>
      ) : (
        <form
          className="chat-action-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && (action === "delete" || (canEdit && body.trim())))
              void submit();
          }}
        >
          <h3>{action === "edit" ? "Edit message" : "Delete message?"}</h3>
          {action === "edit" ? (
            <label>
              Message
              <textarea
                data-action-focus
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                required
                rows={4}
                disabled={busy}
              />
            </label>
          ) : (
            <p>This message will be removed from the chat.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="join-request-actions">
            <button
              data-action-focus={action === "delete" ? true : undefined}
              type="button"
              className="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                (action === "edit"
                  ? !canEdit || !body.trim() || body.trim() === original
                  : !canDelete)
              }
            >
              {action === "edit" ? "Save changes" : "Delete message"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
