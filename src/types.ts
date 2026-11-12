export type Member = { id: string };

export type Discussion = {
  id: string;
  title: string;
  body: string;
  author: string;
};

export type ChatSpace = {
  id: string;
  rooms: Discussion[];
  canPost: boolean;
  canManage?: boolean;
};

export type ChatTransport = <T = unknown>(
  path: string,
  data?: unknown,
  method?: string,
) => Promise<T>;

export type Message = {
  id: string;
  member_id: string;
  author: string;
  body: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_body?: string | null;
  reply_author?: string | null;
  has_replies?: number;
};
export type Participant = { id: string; name: string };
export type Page = {
  items: Message[];
  hasMore: boolean;
  revision: string;
  participants: Participant[];
};
