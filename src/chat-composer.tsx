import React, { useEffect, useRef, useState } from "react";
import { Send, Smile } from "lucide-react";

export function ChatComposer({
  inputRef,
  label,
  draft,
  onDraftChange,
  onSend,
  disabled,
  busy,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  label: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiStatus, setEmojiStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const emojiAnchor = useRef<HTMLDivElement>(null);
  const emojiHost = useRef<HTMLDivElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const emojiId = React.useId();
  const emojiSelection = useRef({ start: 0, end: 0 });
  const insertEmoji = useRef<(emoji: string) => void>(() => {});
  insertEmoji.current = (emoji) => {
    if (disabled || busy) return;
    const { start, end } = emojiSelection.current;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length <= 4000) onDraftChange(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      input.focus({ preventScroll: true });
      if (next.length <= 4000)
        input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  useEffect(() => {
    const host = emojiHost.current;
    if (!emojiOpen || disabled || !host) return;
    let canceled = false;
    setEmojiStatus("loading");
    void Promise.all([import("emoji-mart"), import("@emoji-mart/data")])
      .then(([{ Picker }, { default: data }]) => {
        if (canceled) return;
        const picker = new Picker({
          data,
          autoFocus: true,
          dynamicWidth: true,
          emojiVersion: 15,
          previewPosition: "none",
          set: "native",
          theme: "light",
          onEmojiSelect: ({ native }: { native: string }) =>
            insertEmoji.current(native),
        });
        const element = picker as unknown as HTMLElement;
        // The picker renders its search field inside a shadow root.
        const focusStyle = document.createElement("style");
        focusStyle.textContent = `
          .search input[type="search"]:focus {
            outline: none;
            box-shadow: none;
            background-color: #ededed;
          }
        `;
        element.shadowRoot?.append(focusStyle);
        host.append(element);
        setEmojiStatus("ready");
      })
      .catch(() => {
        if (!canceled) setEmojiStatus("error");
      });
    function dismissOutside(event: PointerEvent) {
      if (
        emojiAnchor.current &&
        !event.composedPath().includes(emojiAnchor.current)
      )
        setEmojiOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      canceled = true;
      host.replaceChildren();
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [emojiOpen, disabled]);
  useEffect(() => {
    setEmojiOpen(false);
  }, [label, disabled]);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight + 2, 132)}px`;
  }, [draft, inputRef]);
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !busy && draft.trim()) onSend();
      }}
    >
      <div
        className="chat-emoji-anchor"
        ref={emojiAnchor}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !emojiOpen) return;
          event.preventDefault();
          event.stopPropagation();
          setEmojiOpen(false);
          emojiButton.current?.focus();
        }}
      >
        <button
          type="button"
          ref={emojiButton}
          className="icon-button"
          aria-label="Choose emoji"
          aria-expanded={emojiOpen}
          aria-controls={emojiOpen ? emojiId : undefined}
          title="Choose emoji"
          disabled={disabled || busy}
          onClick={() => {
            const input = inputRef.current;
            emojiSelection.current = {
              start: input?.selectionStart ?? draft.length,
              end: input?.selectionEnd ?? draft.length,
            };
            setEmojiOpen(!emojiOpen);
          }}
        >
          <Smile size={20} aria-hidden="true" />
        </button>
        {emojiOpen && (
          <div
            className="chat-emoji-popover"
            id={emojiId}
            role="region"
            aria-label="Emoji picker"
          >
            {emojiStatus !== "ready" && (
              <p className="helper" role="status">
                {emojiStatus === "loading"
                  ? "Loading emoji…"
                  : "Emoji picker unavailable. Close it and try again."}
              </p>
            )}
            <div ref={emojiHost} />
          </div>
        )}
      </div>
      <label className="chat-input-label">
        <span className="sr-only">{label}</span>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={4000}
          rows={1}
          required
          disabled={disabled}
          placeholder={
            label === "Message"
              ? "Write a message…"
              : label === "Reply"
                ? "Write a reply…"
                : "Reply in thread…"
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </label>
      <button
        className="button primary chat-send"
        aria-label={
          label === "Message"
            ? "Send message"
            : label === "Reply"
              ? "Send reply"
              : "Send thread reply"
        }
        disabled={disabled || busy || !draft.trim()}
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
