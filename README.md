# Standalone Chat

A React chat component and a runnable reference backend. The UI includes General and discussion rooms, paginated message history, replies and threads, per-room drafts, emoji, editing, deletion, and manager controls. Visible tabs poll for new messages every eight seconds.

## Run the demo

Use Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Open a second tab and choose **Sam** to try messaging between two people. **Alex** can clear a room or delete another person's message. The demo writes to `chat-data.json` in the repository root. To reset it, stop the demo and delete that file.

Run `npm run build` to type-check and build the demo, then `npm start` to preview that build locally.

## Embed the chat in another app

Copy `src/` into a React 19 project that supports TypeScript and CSS imports. Install the runtime dependencies listed in `package.json`. Import from the copied folder's `index.ts`. Use your app's identity and room state, and memoize the transport so it stays stable across renders.

```tsx
import { useState } from "react";
import { createHttpTransport, Chat, type ChatSpace } from "./chat";

const transport = createHttpTransport("/api");

export function WorkspaceChat({ space, userId, openDiscussionForm }: {
  space: ChatSpace;
  userId: string;
  openDiscussionForm: () => void;
}) {
  const [roomId, setRoomId] = useState("general");

  return (
    <Chat
      key={JSON.stringify([space.id, userId])}
      space={space}
      me={{ id: userId }}
      transport={transport}
      discussionId={roomId}
      onDiscussionChange={setRoomId}
      onAddDiscussion={openDiscussionForm}
    />
  );
}
```

The host owns authentication and discussion creation. Pass the available discussions in `space.rooms`, with each entry's ID, title, body, and author. Refresh that list and select the new ID after creating a discussion. The `canPost` and `canManage` props control which UI actions appear. The backend must enforce these permissions independently.

Use `createHttpTransport` for a compatible JSON API. For a different API, provide your own `ChatTransport` that maps requests and responses. Throw the exported `ApiError` with an HTTP status so the UI can react to access changes.

## Where to make changes

- `src/index.ts` is the public entry point. `src/types.ts` defines host props and the transport contract.
- `src/chat.tsx` coordinates the room picker and timeline. The composer, reply panel, and message actions each have their own module. `src/clear-chat.tsx` handles the clear confirmation.
- `src/transport.ts` connects the UI to the host API. `src/chat.css` provides the chat styles.
- `demo/main.tsx` shows host integration, including selecting a demo user and creating discussions.
- `server/demo.mjs` implements the reference API and local persistence. See [the API contract](API.md) to reimplement it with another framework or database.

The demo trusts an `X-Demo-User` header and stores messages in a single local JSON file. Run it on localhost. For a shared deployment, implement authenticated sessions, workspace and room permissions, and durable storage in your host backend.
