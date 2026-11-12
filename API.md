# Chat API contract

Routes below are relative to the transport base URL. The default base is `/api`. Every response is JSON. Failures use an appropriate HTTP status and `{"error":"Readable explanation"}`.

- **GET `/spaces/:spaceId/chat`** reads a page. Omit `discussion` for General, or pass a discussion ID. Use `before` for older history or `after` for new messages, each with a message ID as its cursor. Use `replyTo` to restrict the page to direct replies to a message in the same room. Return up to 50 messages in ascending order with a stable tiebreaker. For initial and older pages, return the newest eligible 50. For newer pages, return the first eligible 50 after the cursor. A stale cursor returns 400 and causes polling to reload the latest page.
- **POST `/spaces/:spaceId/chat`** creates a message from `{body, discussionId?, replyToId?}`. Derive the author from the authenticated session. Validate that any reply target is readable and belongs to the same room. Return a JSON object such as `{id}`.
- **PATCH `/spaces/:spaceId/chat/:messageId`** updates a message using `{body, previousBody}`. Require the author and compare `previousBody` with the stored text to detect stale edits. Return 409 on a conflict.
- **POST `/spaces/:spaceId/moderation`** accepts `{messageId}` for deletion or `{clearChat: true, discussionId?}` to clear a room. Require the author or manager for deletion and the manager for clearing. Scope the action to the space in the URL.

A page has this shape:

```ts
type Page = {
  items: {
    id: string;
    member_id: string;
    author: string;
    body: string;
    created_at: string; // ISO timestamp
    reply_to_id?: string | null;
    reply_body?: string | null;
    reply_author?: string | null;
    has_replies?: number; // 0 or 1
  }[];
  hasMore: boolean;
  revision: string;
  participants: { id: string; name: string }[];
};
```

Change `revision` when an edit, deletion, or room clear invalidates previously loaded messages. New posts can keep the same revision. Return participants for the entire room, even for a page filtered to a reply thread. Suppress quoted text from messages the reader can no longer access. Return 401, 403, or 404 when the session loses access. Reject blank messages and enforce the UI's 4,000-character limit on the server.

The demo also has a GET and POST `/spaces/demo/discussions` endpoint for listing and creating rooms. Your host can supply discussion metadata through its own API.
