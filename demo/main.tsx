import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHttpTransport, Chat, type Discussion } from "../src";
import "./demo.css";

const spaceId = "demo";
const discussionsPath = `/spaces/${spaceId}/discussions`;

function Demo() {
  const [user, setUser] = useState("alex");
  const [room, setRoom] = useState("general");
  const [entries, setEntries] = useState<Discussion[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const transport = useMemo(
    () =>
      createHttpTransport("/api", (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("X-Demo-User", user);
        return fetch(input, { ...init, headers });
      }),
    [user],
  );

  useEffect(() => {
    let active = true;
    const refresh = () => {
      transport<Discussion[]>(discussionsPath)
        .then((items) => {
          if (active) setEntries(items);
        })
        .catch(() => {
          if (active) setError("Could not load discussion rooms.");
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [transport]);

  return (
    <main>
      <h1>Standalone Chat</h1>
      <p>
        Open another tab and choose a different person to try a conversation.
      </p>
      <label>
        Demo user{" "}
        <select value={user} onChange={(event) => setUser(event.target.value)}>
          <option value="alex">Alex (manager)</option>
          <option value="sam">Sam</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {adding && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              const discussion = await transport<Discussion>(discussionsPath, {
                title: fields.get("title"),
                body: fields.get("body"),
              });
              setEntries((items) => [
                ...items.filter(({ id }) => id !== discussion.id),
                discussion,
              ]);
              setRoom(discussion.id);
              setAdding(false);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Title <input name="title" required maxLength={160} />
          </label>
          <label>
            Prompt <textarea name="body" required maxLength={4000} />
          </label>
          <button type="submit" disabled={busy}>
            Create discussion
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </form>
      )}
      <Chat
        key={user}
        space={{
          id: spaceId,
          rooms: entries,
          canPost: true,
          canManage: user === "alex",
        }}
        me={{ id: user }}
        transport={transport}
        discussionId={room}
        onDiscussionChange={setRoom}
        onAddDiscussion={() => setAdding(true)}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
