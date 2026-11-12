import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const users = { alex: "Alex", sam: "Sam" };
const dataFile = "chat-data.json";
const demoSpace = "demo";
const empty = { messages: [], discussions: [], revision: 0, sequence: 0 };

function problem(status, message) {
  throw Object.assign(new Error(message), { status });
}

function load() {
  try {
    return JSON.parse(readFileSync(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(empty);
    throw error;
  }
}

function save(state) {
  writeFileSync(dataFile + ".tmp", JSON.stringify(state), { mode: 0o600 });
  renameSync(dataFile + ".tmp", dataFile);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000) problem(413, "Request is too large.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {}
  problem(400, "Expected a JSON object.");
}

function requiredText(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    problem(400, `Enter text between 1 and ${max} characters.`);
  return value.trim();
}

function room(state, id) {
  if (id == null || id === "general") return "general";
  if (!state.discussions.some((discussion) => discussion.id === id))
    problem(404, "Discussion unavailable.");
  return id;
}

function history(state, query) {
  const roomId = room(state, query.get("discussion"));
  const messages = state.messages.filter(
    (message) => message.roomId === roomId,
  );
  const byId = new Map(messages.map((message) => [message.id, message]));
  const replyTo = query.get("replyTo");
  if (replyTo !== null && !byId.has(replyTo))
    problem(404, "Message unavailable.");
  const eligible =
    replyTo === null
      ? messages
      : messages.filter((message) => message.reply_to_id === replyTo);
  const before = query.get("before");
  const after = query.get("after");
  if (before && after) problem(400, "Choose one cursor.");
  const index =
    before || after
      ? eligible.findIndex((message) => message.id === (before || after))
      : eligible.length;
  if (index < 0) problem(400, "Chat cursor expired.");
  const window = after ? eligible.slice(index + 1) : eligible.slice(0, index);
  const page = after ? window.slice(0, 50) : window.slice(-50);
  const parents = new Set(messages.map((message) => message.reply_to_id));
  return {
    items: page.map(({ roomId, ...message }) => {
      const parent = byId.get(message.reply_to_id);
      return {
        ...message,
        reply_body: parent?.body ?? null,
        reply_author: parent?.author ?? null,
        has_replies: Number(parents.has(message.id)),
      };
    }),
    hasMore: window.length > 50,
    revision: String(state.revision),
    participants: [
      ...new Set(messages.map((message) => message.member_id)),
    ].map((id) => ({ id, name: users[id] })),
  };
}

function mutate(state, action, id, body, user) {
  if (action === "discussions") {
    const discussion = {
      id: randomUUID(),
      title: requiredText(body.title, 160),
      body: requiredText(body.body, 4000),
      author: users[user],
    };
    state.discussions.push(discussion);
    return discussion;
  }
  if (action === "chat" && !id) {
    const roomId = room(state, body.discussionId);
    if (
      body.replyToId != null &&
      !state.messages.some(
        (message) => message.id === body.replyToId && message.roomId === roomId,
      )
    )
      problem(404, "Reply target unavailable in this room.");
    const message = {
      id: String(++state.sequence).padStart(16, "0"),
      roomId,
      member_id: user,
      author: users[user],
      body: requiredText(body.body, 4000),
      created_at: new Date().toISOString(),
      reply_to_id: body.replyToId ?? null,
    };
    state.messages.push(message);
    return { id: message.id };
  }
  if (action === "moderation" && body.clearChat === true) {
    if (user !== "alex") problem(403, "Only the room manager can clear chat.");
    const roomId = room(state, body.discussionId);
    state.messages = state.messages.filter(
      (message) => message.roomId !== roomId,
    );
  } else {
    const messageId = action === "chat" ? id : body.messageId;
    const index = state.messages.findIndex(
      (message) => message.id === messageId,
    );
    if (index < 0) problem(404, "Message unavailable.");
    const message = state.messages[index];
    if (action === "chat") {
      if (message.member_id !== user)
        problem(403, "Only the author can edit this message.");
      if (body.previousBody !== message.body)
        problem(409, "This message has changed. Reopen it and try again.");
      message.body = requiredText(body.body, 4000);
    } else {
      if (message.member_id !== user && user !== "alex")
        problem(
          403,
          "Only the author or room manager can remove this message.",
        );
      state.messages.splice(index, 1);
    }
  }
  state.revision++;
  return { ok: true };
}

export async function demoApi(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return next();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const match =
      /^\/api\/spaces\/([^/]+)\/(chat|discussions|moderation)(?:\/([^/]+))?$/.exec(
        url.pathname,
      );
    if (match?.[1] !== demoSpace) problem(404, "Route unavailable.");
    const [, , action, id] = match;
    const user = req.headers["x-demo-user"];
    if (typeof user !== "string" || !Object.hasOwn(users, user))
      problem(401, "Choose a demo user.");
    let result;
    if (req.method === "GET" && !id && action === "chat") {
      result = history(load(), url.searchParams);
    } else if (req.method === "GET" && !id && action === "discussions") {
      result = load().discussions;
    } else if (
      (req.method === "POST" && !id) ||
      (req.method === "PATCH" && action === "chat" && id)
    ) {
      const body = await readBody(req);
      // Read, modify, and save synchronously to serialize writes in this process.
      const state = load();
      result = mutate(state, action, id, body, user);
      save(state);
    } else problem(405, "Method unavailable.");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error.status || 500;
    if (!error.status) console.error(error);
    res.end(
      JSON.stringify({
        error: error.status ? error.message : "Chat storage failed.",
      }),
    );
  }
}
