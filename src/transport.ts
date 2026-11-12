import { createContext, useContext } from "react";
import type { ChatTransport } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const context = createContext<ChatTransport | null>(null);
export const ChatTransportProvider = context.Provider;

export function useChatTransport() {
  const transport = useContext(context);
  if (!transport) throw new Error("Chat transport is required.");
  return transport;
}

export function createHttpTransport(
  base = "/api",
  request: typeof fetch = fetch,
): ChatTransport {
  return async (path, data, method = data === undefined ? "GET" : "POST") => {
    const response = await request(base + path, {
      method,
      headers:
        data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        result.error ?? "Chat request failed.",
      );
    return result;
  };
}
