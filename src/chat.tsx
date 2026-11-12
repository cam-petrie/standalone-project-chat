import { initials, MessageSender } from "./message-sender";
import { ChatComposer } from "./chat-composer";
import { MessageActions } from "./message-actions";
import { MessageReplies } from "./message-replies";
import { ClearChat } from "./clear-chat";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Reply, X } from "lucide-react";
import { useChatTransport, ApiError, ChatTransportProvider } from "./transport";
import type {
  Member,
  ChatSpace,
  ChatTransport,
  Message,
  Page,
  Participant,
} from "./types";
function sameMessageGroup(
  first: Message | undefined,
  second: Message | undefined,
) {
  return (
    !!first &&
    !!second &&
    first.member_id === second.member_id &&
    Date.parse(second.created_at) - Date.parse(first.created_at) <= 5 * 60_000
  );
}
function senderHues(ids: string[]) {
  const hues = new Map<string, number>();
  const palette = [210, 275, 345, 32, 165, 64, 235, 310, 12, 125, 188, 90];
  const used = new Set<number>();
  for (const id of [...new Set(ids)].sort()) {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }
    const start = (hash >>> 0) % palette.length;
    let hue: number | undefined;
    for (let offset = 0; offset < palette.length; offset++) {
      const candidate = palette[(start + offset) % palette.length];
      if (!used.has(candidate)) {
        hue = candidate;
        break;
      }
    }
    hue ??= ((hash >>> 0) / 2 ** 32) * 360;
    used.add(hue);
    hues.set(id, hue);
  }
  return hues;
}
type Discussion = ChatSpace["rooms"][number];
export function Chat({
  transport,
  ...props
}: ChatProps & { transport: ChatTransport }) {
  return (
    <ChatTransportProvider value={transport}>
      <ChatRooms {...props} />
    </ChatTransportProvider>
  );
}

export type ChatProps = {
  space: ChatSpace;
  me: Member;
  discussionId?: string;
  onDiscussionChange: (id: string) => void;
  onAddDiscussion: () => void;
};

function ChatRooms({
  space,
  me,
  discussionId = "general",
  onDiscussionChange,
  onAddDiscussion,
}: ChatProps) {
  const discussions = space.rooms;
  const selected = discussions.find((entry) => entry.id === discussionId);
  const roomId = selected?.id || "general";
  useEffect(() => {
    if (discussionId && discussionId !== "general" && !selected)
      onDiscussionChange("general");
  }, [discussionId, selected?.id, onDiscussionChange]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTargets, setReplyTargets] = useState<
    Record<string, Message | undefined>
  >({});
  return (
    <section className="custom-chat-rooms" aria-label="Chat rooms">
      <div className="chat-room-heading">
        <label htmlFor={`discussion-${space.id}`}>Discussion</label>
        <button
          type="button"
          className="text-button"
          onClick={onAddDiscussion}
          disabled={!space.canPost}
        >
          <Plus size={17} aria-hidden="true" /> Add Discussion
        </button>
      </div>
      <div className="chat-room-selector">
        <select
          id={`discussion-${space.id}`}
          value={roomId}
          onChange={(event) => onDiscussionChange(event.target.value)}
        >
          <option value="general">General</option>
          {discussions.map((discussion) => (
            <option key={discussion.id} value={discussion.id}>
              {discussion.title}
            </option>
          ))}
        </select>
      </div>
      <p className="helper">
        General is always available. Each discussion question has its own
        conversation.
      </p>
      <ChatConversation
        key={JSON.stringify([space.id, me.id, roomId])}
        space={space}
        me={me}
        discussion={selected}
        draft={drafts[roomId] || ""}
        replyDraft={drafts[`${roomId}:${replyTargets[roomId]?.id}`] || ""}
        setReplyDraft={(messageId, value) =>
          setDrafts((previous) => ({
            ...previous,
            [`${roomId}:${messageId}`]: value,
          }))
        }
        replyTarget={replyTargets[roomId]}
        setReplyTarget={(value) =>
          setReplyTargets((previous) => ({ ...previous, [roomId]: value }))
        }
        setDraft={(value) =>
          setDrafts((previous) => ({ ...previous, [roomId]: value }))
        }
      />
    </section>
  );
}
function ChatConversation({
  space,
  me,
  discussion,
  draft,
  setDraft,
  replyDraft,
  setReplyDraft,
  replyTarget,
  setReplyTarget,
}: {
  space: ChatSpace;
  me: Member;
  discussion?: Discussion;
  draft: string;
  setDraft: (value: string) => void;
  replyDraft: string;
  setReplyDraft: (messageId: string, value: string) => void;
  replyTarget?: Message;
  setReplyTarget: (value: Message | undefined) => void;
}) {
  const api = useChatTransport();
  const [messages, setMessages] = useState<Message[]>([]),
    [participants, setParticipants] = useState<Participant[]>([]),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState(""),
    [readError, setReadError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [older, setOlder] = useState(false),
    [connected, setConnected] = useState(true),
    [accessLost, setAccessLost] = useState(false);
  const colors = useMemo(
    () =>
      senderHues(
        [
          ...participants.map((person) => person.id),
          ...messages.map((message) => message.member_id),
        ].filter((id) => id !== me.id),
      ),
    [participants, messages, me.id],
  );
  const [actions, setActions] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const [threadId, setThreadId] = useState<string>();
  const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({});
  const [threadRefresh, setThreadRefresh] = useState(0);
  const [threadError, setThreadError] = useState("");
  const threadComposer = useRef<HTMLTextAreaElement>(null);
  const threadPanel = useRef<HTMLElement>(null);
  const loadedReplyParents = useMemo(
    () => new Set(messages.map((message) => message.reply_to_id)),
    [messages],
  );
  function hasReplies(message: Message) {
    return !!message.has_replies || loadedReplyParents.has(message.id);
  }
  function senderStyle(message: Message): React.CSSProperties {
    return {
      "--chat-sender-hue": colors.get(message.member_id),
      "--chat-sender-fill": message.member_id === me.id ? "#fff" : undefined,
    } as React.CSSProperties;
  }
  const [highlighted, setHighlighted] = useState<string>();
  const [jumpTo, setJumpTo] = useState<string>();
  const highlightTimer = useRef<number | undefined>(undefined);
  const hold = useRef<{
    timer: number;
    pointer: number;
    x: number;
    y: number;
    anchor: HTMLElement;
    swipe: boolean;
  } | null>(null);
  function cancelHold() {
    if (!hold.current) return;
    window.clearTimeout(hold.current.timer);
    hold.current.anchor.style.removeProperty("--chat-swipe");
    hold.current = null;
  }
  useEffect(
    () => () => {
      cancelHold();
      window.clearTimeout(highlightTimer.current);
    },
    [],
  );
  function openActions(id: string, anchor: HTMLElement) {
    cancelHold();
    anchor.focus({ preventScroll: true });
    setActions({ id, anchor });
  }
  const scroll = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    replyOpener = useRef<HTMLElement>(null),
    revision = useRef<string | undefined>(undefined),
    latest = useRef<string | undefined>(undefined),
    oldest = useRef<string | undefined>(undefined),
    alive = useRef(true),
    fetching = useRef(false),
    atBottom = useRef(true);
  const topic = discussion
    ? `discussion=${encodeURIComponent(discussion.id)}`
    : "";
  const chatPath = (cursor = "") =>
    `/spaces/${encodeURIComponent(space.id)}/chat${topic || cursor ? `?${[topic, cursor].filter(Boolean).join("&")}` : ""}`;
  const read = useCallback(
    async (initial = false) => {
      if (fetching.current) return;
      fetching.current = true;
      try {
        let reload = initial || !latest.current;
        let page;
        try {
          page = await api<Page>(
            chatPath(
              reload ? "" : `after=${encodeURIComponent(latest.current!)}`,
            ),
          );
        } catch (error) {
          if (reload || !(error instanceof ApiError) || error.status !== 400)
            throw error;
          reload = true;
          page = await api<Page>(chatPath());
        }
        if (!alive.current) return;
        const changed =
          revision.current !== undefined && page.revision !== revision.current;
        const reset = reload || changed;
        if (changed && !reload) page = await api<Page>(chatPath());
        if (!alive.current) return;
        if (changed) setReplyTarget(undefined);
        revision.current = page.revision;
        setParticipants(page.participants);
        setMessages((previous) => {
          if (reset) return page.items;
          const map = new Map(previous.map((m) => [m.id, m]));
          for (const message of page.items) map.set(message.id, message);
          return [...map.values()].sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          );
        });
        if (page.items.length)
          latest.current = page.items[page.items.length - 1].id;
        if (reset) {
          latest.current = page.items.at(-1)?.id;
          oldest.current = page.items[0]?.id;
          setOlder(page.hasMore);
        }
        setAccessLost(false);
        setConnected(true);
        setReadError("");
      } catch (e) {
        if (alive.current) {
          setConnected(false);
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            setAccessLost(true);
            setMessages([]);
            setActions(null);
            setThreadId(undefined);
            setJumpTo(undefined);
            setParticipants([]);
            setReplyTarget(undefined);
            setReadError(
              "This conversation is no longer accessible. Choose another discussion or reopen chat.",
            );
          } else if (initial)
            setReadError(
              e instanceof ApiError && e.status === 404
                ? "This conversation is no longer available. Choose General or another discussion."
                : "Chat could not be loaded. Retrying automatically…",
            );
        }
      } finally {
        fetching.current = false;
        if (alive.current) setLoading(false);
      }
    },
    [api, space.id, discussion?.id],
  );
  useEffect(() => {
    alive.current = true;
    void read(true);
    const interval = setInterval(() => {
      if (!document.hidden) void read();
    }, 8000);
    const onVisible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [read]);
  useEffect(() => {
    if (atBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);
  async function loadOlder(targetId?: string) {
    if (!oldest.current || busy) return;
    setBusy(true);
    setError("");
    const box = scroll.current;
    const height = box?.scrollHeight || 0;
    const top = box?.scrollTop || 0;
    let cursor = oldest.current;
    let hasMore = true;
    let found = false;
    let earlier: Message[] = [];
    try {
      do {
        const page = await api<Page>(
          chatPath(`before=${encodeURIComponent(cursor)}`),
        );
        if (!alive.current) return;
        if (
          revision.current !== undefined &&
          page.revision !== revision.current
        ) {
          await read(true);
          setError("Chat history changed. Try opening the original again.");
          return;
        }
        earlier = [...page.items, ...earlier];
        cursor = page.items[0]?.id || cursor;
        hasMore = page.hasMore && page.items.length > 0;
        found = page.items.some((message) => message.id === targetId);
      } while (targetId && !found && hasMore);

      atBottom.current = false;
      setMessages((previous) => {
        const ids = new Set(previous.map((message) => message.id));
        return [
          ...earlier.filter((message) => !ids.has(message.id)),
          ...previous,
        ];
      });
      oldest.current = cursor;
      setOlder(hasMore);
      if (found) setJumpTo(targetId);
      else {
        if (targetId) setError("The original message is unavailable.");
        requestAnimationFrame(() => {
          if (box) box.scrollTop = top + box.scrollHeight - height;
        });
      }
    } catch (error) {
      if (alive.current) setError((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const canSend = !accessLost && space.canPost;
  const selectedMessage =
    actions && messages.find((message) => message.id === actions.id);
  const threadMessage = messages.find((message) => message.id === threadId);
  const replyId = replyTarget?.id;
  useEffect(() => {
    if (replyId) composer.current?.focus({ preventScroll: true });
  }, [replyId]);
  useEffect(() => {
    if (threadId) threadPanel.current?.focus();
  }, [threadId]);
  function openThread(message: Message, anchor: HTMLElement) {
    replyOpener.current = anchor;
    setActions(null);
    setThreadError("");
    setThreadId(message.id);
  }
  function replyTo(message: Message, anchor: HTMLElement) {
    if (hasReplies(message)) openThread(message, anchor);
    else startReply(message, anchor);
  }
  function startReply(message: Message, anchor: HTMLElement) {
    if (!canSend) return;
    replyOpener.current = anchor;
    setActions(null);
    setReplyTarget(message);
    composer.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!jumpTo || !scroll.current) return;
    const box = scroll.current;
    const original = box.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(jumpTo)}"]`,
    );
    if (!original) return;
    atBottom.current = false;
    box.scrollTo({
      top:
        box.scrollTop +
        original.getBoundingClientRect().top -
        box.getBoundingClientRect().top -
        (box.clientHeight - original.offsetHeight) / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    setHighlighted(jumpTo);
    setJumpTo(undefined);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlighted(undefined),
      1600,
    );
  }, [jumpTo, messages]);

  function openOriginal(id: string) {
    if (messages.some((message) => message.id === id)) setJumpTo(id);
    else if (older) void loadOlder(id);
    else setError("The original message is unavailable.");
  }

  async function sendMessage(
    body: string,
    targetId?: string,
    inThread = false,
  ) {
    if (!canSend || !body.trim() || busy) return;
    setBusy(true);
    const reportError = inThread ? setThreadError : setError;
    reportError("");
    try {
      await api(`/spaces/${encodeURIComponent(space.id)}/chat`, {
        body,
        discussionId: discussion?.id,
        replyToId: targetId,
      });
      if (inThread && targetId) {
        setThreadDrafts((previous) => ({ ...previous, [targetId]: "" }));
        setThreadRefresh((previous) => previous + 1);
      } else if (targetId) {
        setReplyDraft(targetId, "");
        setReplyTarget(undefined);
      } else setDraft("");
      if (!alive.current) return;
      if (!inThread) atBottom.current = true;
      await read();
    } catch (e) {
      if (alive.current) reportError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="custom-chat" aria-label="Chat">
      <div className="chat-heading">
        <div>
          <h3>{discussion ? discussion.title : "General"}</h3>
          <p className="helper">
            {discussion
              ? "A conversation about this discussion question."
              : "The shared conversation for this space."}
          </p>
        </div>
        <div className="chat-view-controls">
          <span className="helper" role="status">
            {connected ? "Updates every 8 seconds" : "Reconnecting…"}
          </span>
          <button
            type="button"
            className="button"
            aria-expanded={expanded}
            aria-controls={`chat-history-${space.id}-${discussion?.id || "general"}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Compact chat" : "Expand chat"}
          </button>
        </div>
      </div>
      {space.canManage && (
        <ClearChat
          label="Clear chat"
          warning="Remove all messages from this chat? The chat itself will remain available."
          path={`/spaces/${encodeURIComponent(space.id)}/moderation`}
          data={{ clearChat: true, discussionId: discussion?.id }}
          onChanged={() => read(true)}
        />
      )}
      {!loading &&
        !readError &&
        (participants.length ? (
          <details className="chat-participants">
            <summary>
              <span className="chat-participant-avatars" aria-hidden="true">
                {participants.slice(0, 3).map((person) => (
                  <span key={person.id}>{initials(person.name)}</span>
                ))}
              </span>
              <span>
                {participants.length}{" "}
                {participants.length === 1 ? "participant" : "participants"}
              </span>
              <span className="helper">View people</span>
            </summary>
            <p className="helper">People who have posted in this discussion.</p>
            <ul>
              {participants.map((person) => (
                <li key={person.id}>
                  {person.name}
                  {person.id === me.id ? " (you)" : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="helper chat-participants-empty">
            No participants yet. Send the first message to join this discussion.
          </p>
        ))}
      {discussion && (
        <details className="chat-discussion-context">
          <summary>View discussion question</summary>
          <p>{discussion.body}</p>
          <span className="helper">Started by {discussion.author}</span>
        </details>
      )}
      <p className="helper chat-resize-hint">
        Expand the history above, or drag its lower-right corner to resize it.
      </p>
      {(error || readError) && (
        <p className="error" role="alert">
          {error || readError}
        </p>
      )}
      <div
        className={
          threadMessage ? "chat-layout chat-layout-with-replies" : "chat-layout"
        }
      >
        <div className="chat-main">
          <div
            className="chat-messages"
            id={`chat-history-${space.id}-${discussion?.id || "general"}`}
            style={{
              height: expanded ? "min(760px, 75dvh)" : "min(560px, 62dvh)",
            }}
            ref={scroll}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
            onScroll={() => {
              const box = scroll.current;
              if (box)
                atBottom.current =
                  box.scrollHeight - box.scrollTop - box.clientHeight < 60;
            }}
          >
            {older && (
              <button
                className="button chat-older"
                disabled={busy}
                onClick={() => void loadOlder()}
              >
                Load earlier messages
              </button>
            )}
            {loading ? (
              <p className="helper">Loading conversation…</p>
            ) : (
              !messages.length && (
                <p className="chat-empty">
                  No messages yet. Start the conversation.
                </p>
              )
            )}
            {messages.map((message, index) => (
              <article
                className={[
                  "chat-message",
                  message.member_id === me.id && "chat-own",
                  sameMessageGroup(messages[index - 1], message) &&
                    "chat-group-previous",
                  sameMessageGroup(message, messages[index + 1]) &&
                    "chat-group-next",
                  highlighted === message.id && "chat-highlighted",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-message-id={message.id}
                style={senderStyle(message)}
                key={message.id}
              >
                <div
                  className="chat-bubble"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  aria-label={`Message from ${message.author}. Press Enter for actions.`}
                  onPointerDown={(event) => {
                    if (
                      !event.isPrimary ||
                      event.button !== 0 ||
                      (event.target as HTMLElement).closest("button")
                    )
                      return;
                    cancelHold();
                    const { currentTarget, clientX, clientY, pointerId } =
                      event;
                    hold.current = {
                      pointer: pointerId,
                      anchor: currentTarget,
                      swipe: event.pointerType === "touch",
                      x: clientX,
                      y: clientY,
                      timer: window.setTimeout(
                        () => openActions(message.id, currentTarget),
                        500,
                      ),
                    };
                  }}
                  onPointerMove={(event) => {
                    const press = hold.current;
                    if (press?.pointer !== event.pointerId) return;
                    const dx = event.clientX - press.x;
                    const dy = event.clientY - press.y;
                    if (Math.hypot(dx, dy) <= 8) return;
                    window.clearTimeout(press.timer);
                    if (
                      !press.swipe ||
                      !canSend ||
                      dx <= 0 ||
                      dx < Math.abs(dy) * 1.3
                    ) {
                      cancelHold();
                      return;
                    }
                    press.anchor.style.setProperty(
                      "--chat-swipe",
                      `${Math.min(dx, 64)}px`,
                    );
                  }}
                  onPointerUp={(event) => {
                    const press = hold.current;
                    const dx = press ? event.clientX - press.x : 0;
                    const dy = press ? Math.abs(event.clientY - press.y) : 0;
                    if (
                      press?.pointer === event.pointerId &&
                      press.swipe &&
                      dx >= 55 &&
                      dx > dy * 1.3
                    )
                      replyTo(message, press.anchor);
                    cancelHold();
                  }}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openActions(message.id, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !["Enter", " ", "ContextMenu"].includes(event.key) &&
                      !(event.shiftKey && event.key === "F10")
                    )
                      return;
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    openActions(message.id, event.currentTarget);
                  }}
                >
                  <div className="chat-message-meta">
                    <MessageSender message={message} memberId={me.id} />
                    <time
                      dateTime={message.created_at}
                      title={new Date(message.created_at).toLocaleString()}
                    >
                      {new Date(message.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {canSend && (
                      <button
                        type="button"
                        className="chat-inline-reply"
                        aria-label={`${hasReplies(message) ? "Reply in thread" : "Reply"} to message from ${message.member_id === me.id ? "you" : message.author}`}
                        title={
                          hasReplies(message) ? "Reply in thread" : "Reply"
                        }
                        disabled={busy}
                        onClick={(event) =>
                          replyTo(message, event.currentTarget)
                        }
                      >
                        <Reply size={15} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {message.reply_to_id &&
                    (message.reply_body != null ? (
                      <button
                        type="button"
                        className="chat-reply-quote chat-quote-link"
                        aria-label={`Jump to message from ${message.reply_author}`}
                        disabled={busy}
                        onClick={() => openOriginal(message.reply_to_id!)}
                      >
                        <strong>{message.reply_author}</strong>
                        <span className="chat-quote-snippet">
                          {message.reply_body}
                        </span>
                      </button>
                    ) : (
                      <blockquote className="chat-reply-quote">
                        <p>Original message unavailable.</p>
                      </blockquote>
                    ))}
                  <p>{message.body}</p>
                </div>
              </article>
            ))}
          </div>
          {!space.canPost && <p className="helper">This chat is read-only.</p>}
          <div className="chat-input-bar">
            {replyTarget && (
              <div
                className="chat-reply-preview"
                role="status"
                style={senderStyle(replyTarget)}
              >
                <div>
                  <strong>
                    Replying to{" "}
                    {replyTarget.member_id === me.id
                      ? "yourself"
                      : replyTarget.author}
                  </strong>
                  <span className="chat-quote-snippet">{replyTarget.body}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancel reply"
                  onClick={() => {
                    setReplyTarget(undefined);
                    composer.current?.focus({ preventScroll: true });
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <ChatComposer
              inputRef={composer}
              label={replyTarget ? "Reply" : "Message"}
              draft={replyTarget ? replyDraft : draft}
              onDraftChange={
                replyTarget
                  ? (value) => setReplyDraft(replyTarget.id, value)
                  : setDraft
              }
              onSend={() =>
                sendMessage(replyTarget ? replyDraft : draft, replyTarget?.id)
              }
              disabled={!canSend}
              busy={busy}
            />
          </div>
        </div>
        {threadMessage && (
          <aside
            className="chat-reply-panel"
            aria-label="Message thread"
            tabIndex={-1}
            ref={threadPanel}
          >
            <div className="chat-reply-panel-heading">
              <h3>Thread</h3>
              <button
                type="button"
                className="icon-button"
                aria-label="Close replies"
                onClick={() => {
                  setThreadId(undefined);
                  replyOpener.current?.focus();
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <blockquote className="chat-reply-quote">
              <MessageSender message={threadMessage} memberId={me.id} />
              <p>{threadMessage.body}</p>
            </blockquote>
            <MessageReplies
              key={`${threadMessage.id}:${threadRefresh}:${revision.current || ""}:${messages.filter((message) => message.reply_to_id === threadMessage.id).at(-1)?.id || ""}`}
              path={chatPath(`replyTo=${encodeURIComponent(threadMessage.id)}`)}
              memberId={me.id}
            />
            {canSend && (
              <div className="chat-input-bar">
                {threadError && (
                  <p className="error" role="alert">
                    {threadError}
                  </p>
                )}
                <ChatComposer
                  inputRef={threadComposer}
                  label="Reply in thread"
                  draft={threadDrafts[threadMessage.id] || ""}
                  onDraftChange={(value) =>
                    setThreadDrafts((previous) => ({
                      ...previous,
                      [threadMessage.id]: value,
                    }))
                  }
                  onSend={() =>
                    sendMessage(
                      threadDrafts[threadMessage.id] || "",
                      threadMessage.id,
                      true,
                    )
                  }
                  disabled={!canSend}
                  busy={busy}
                />
              </div>
            )}
          </aside>
        )}
      </div>
      {actions && selectedMessage && !accessLost && (
        <MessageActions
          key={selectedMessage.id}
          message={selectedMessage}
          anchor={actions.anchor}
          canEdit={canSend && selectedMessage.member_id === me.id}
          canDelete={
            !!space.canManage ||
            (canSend && selectedMessage.member_id === me.id)
          }
          spaceId={space.id}
          onClose={() => setActions(null)}
          replyLabel={hasReplies(selectedMessage) ? "Reply in thread" : "Reply"}
          onReply={
            canSend ? () => replyTo(selectedMessage, actions.anchor) : undefined
          }
          onViewReplies={() => openThread(selectedMessage, actions.anchor)}
          onChanged={async () => {
            setActions(null);
            await read(true);
          }}
        />
      )}
    </section>
  );
}
