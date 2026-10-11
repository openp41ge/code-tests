/**
 * ChatSearchModel — the Search chats sidebar: the query (with regex / match
 * case) searches the workspace's chats (their messages and tool calls); the
 * results are the matching chats, with how many messages match. A newer
 * query wins over an answer still on its way. A result opens its chat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatSearchModel,
  searchSummary,
  type ChatSearchHost,
} from "@openp41ge-extension-agents/views/chat-search-model";
import { CHAT_APP_TYPE } from "@openp41ge-extension-agents/views/chats-model";

let host: ChatSearchHost & {
  dispatch: ReturnType<typeof vi.fn>;
  openTab: ReturnType<typeof vi.fn>;
};
const CHATS = [
  { id: "a", title: "Alpha", updatedAt: 1, createdAt: 1 },
  { id: "b", title: "Beta", updatedAt: 2, createdAt: 2 },
];

beforeEach(() => {
  host = {
    dispatch: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      if (command === "list") return CHATS;
      if (command === "search") {
        return payload?.query === "x"
          ? [{ chatId: "b", matchedMessageIds: ["m1", "m2"], matchedToolCallIds: ["t"] }]
          : [];
      }
      return undefined;
    }),
    subscribe: () => () => undefined,
    openTab: vi.fn(),
  };
});

describe("ChatSearchModel", () => {
  it("is idle without a query, counting the chats it would search", async () => {
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    expect(m.state.results).toBeNull();
    expect(searchSummary(m.state)).toBe("Searches 2 chats");
  });

  it("lists the matching chats with their match counts", async () => {
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    await m.setQuery("x");
    expect(m.state.results).toEqual([{ chat: CHATS[1], messages: 2, toolCalls: 1 }]);
    expect(searchSummary(m.state)).toBe("1 chat matches");
    expect(host.dispatch).toHaveBeenCalledWith("search", {
      query: "x",
      options: { regex: false, caseSensitive: false },
    });
  });

  it("searches again with the regex and match-case options", async () => {
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    await m.setQuery("x");
    await m.toggle("regex");
    await m.toggle("caseSensitive");
    expect(host.dispatch).toHaveBeenLastCalledWith("search", {
      query: "x",
      options: { regex: true, caseSensitive: true },
    });
  });

  it("says when nothing matches", async () => {
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    await m.setQuery("nope");
    expect(m.state.results).toEqual([]);
    expect(searchSummary(m.state)).toBe("No chats match");
  });

  it("keeps the newest query's answer", async () => {
    let release: () => void = () => undefined;
    host.dispatch = vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      if (command === "list") return CHATS;
      if (payload?.query === "slow") await new Promise<void>((r) => (release = r));
      return payload?.query === "x"
        ? [{ chatId: "b", matchedMessageIds: ["m"], matchedToolCallIds: [] }]
        : [{ chatId: "a", matchedMessageIds: ["m"], matchedToolCallIds: [] }];
    });
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    const slow = m.setQuery("slow");
    await m.setQuery("x");
    release();
    await slow;
    expect(m.state.results?.map((r) => r.chat.id)).toEqual(["b"]);
  });

  it("shows a refused regex as the error", async () => {
    host.dispatch = vi.fn(async (command: string) => {
      if (command === "list") return CHATS;
      throw new Error("Invalid regular expression");
    });
    const m = new ChatSearchModel(host, () => undefined);
    await m.start();
    await m.setQuery("(");
    expect(searchSummary(m.state)).toMatch(/Invalid regular expression/);
  });

  it("opens a result's chat as a preview", async () => {
    const m = new ChatSearchModel(host, () => undefined);
    m.openChat("b");
    expect(host.openTab).toHaveBeenCalledWith({
      appType: CHAT_APP_TYPE,
      params: { chatId: "b" },
      key: "b",
      pinned: false,
    });
  });
});
