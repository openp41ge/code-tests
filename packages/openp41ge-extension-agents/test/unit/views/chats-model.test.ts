/**
 * ChatsModel — the Agents sidebar's chat list: the workspace's chats (most
 * recently used first) and where each is open, kept current from the
 * backend's pushes; a new chat opens pinned; a chat opens as a preview (or
 * pinned) unless it is open in another window.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatsModel,
  CHAT_APP_TYPE,
  type ChatsHost,
} from "@openp41ge-extension-agents/views/chats-model";

let topics: Map<string, Set<() => void>>;
let answers: Record<string, unknown>;
let host: ChatsHost & { openTab: ReturnType<typeof vi.fn> };

const push = (topic: string) => {
  for (const fn of topics.get(topic) ?? []) fn();
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  topics = new Map();
  answers = {
    list: [
      { id: "a", title: "Older", updatedAt: 1, createdAt: 1 },
      { id: "b", title: "Newer", updatedAt: 5, createdAt: 2 },
    ],
    "open-chats": { a: "elsewhere" },
    create: { id: "new", title: "New one" },
  };
  host = {
    dispatch: vi.fn(async (command: string) => answers[command]),
    subscribe: (topic, fn) => {
      let set = topics.get(topic);
      if (!set) topics.set(topic, (set = new Set()));
      set.add(fn as () => void);
      return () => set.delete(fn as () => void);
    },
    openTab: vi.fn(),
  };
});

describe("ChatsModel", () => {
  it("lists the chats, most recently used first, and where each is open", async () => {
    const changed = vi.fn();
    const m = new ChatsModel(host, changed);
    m.start();
    await flush();
    expect(m.state.chats?.map((c) => c.id)).toEqual(["b", "a"]);
    expect(m.state.open).toEqual({ a: "elsewhere" });
    expect(changed).toHaveBeenCalled();
  });

  it("refreshes on the backend's pushes, and stops listening when stopped", async () => {
    const m = new ChatsModel(host, () => undefined);
    m.start();
    await flush();
    answers.list = [{ id: "c", title: "Third", updatedAt: 9, createdAt: 9 }];
    push("changed");
    await flush();
    expect(m.state.chats?.map((c) => c.id)).toEqual(["c"]);

    answers["open-chats"] = {};
    push("open-state");
    await flush();
    expect(m.state.open).toEqual({});

    m.stop();
    answers.list = [];
    push("changed");
    await flush();
    expect(m.state.chats?.map((c) => c.id)).toEqual(["c"]);
  });

  it("opens a chat as a preview or pinned, keyed by its id", () => {
    const m = new ChatsModel(host, () => undefined);
    m.openChat("b");
    m.openChat("b", true);
    expect(host.openTab.mock.calls).toEqual([
      [{ appType: CHAT_APP_TYPE, params: { chatId: "b" }, key: "b", pinned: false }],
      [{ appType: CHAT_APP_TYPE, params: { chatId: "b" }, key: "b", pinned: true }],
    ]);
  });

  it("does not open a chat that is open in another window", async () => {
    const m = new ChatsModel(host, () => undefined);
    m.start();
    await flush();
    expect(m.openChat("a")).toBe(false);
    expect(host.openTab).not.toHaveBeenCalled();
  });

  it("creates a chat and opens it pinned", async () => {
    const m = new ChatsModel(host, () => undefined);
    await m.newChat();
    expect(host.openTab).toHaveBeenCalledWith({
      appType: CHAT_APP_TYPE,
      params: { chatId: "new" },
      key: "new",
      pinned: true,
    });
  });

  it("keeps the error when listing fails", async () => {
    host.dispatch = vi.fn(async () => {
      throw new Error("no workspace");
    });
    const m = new ChatsModel(host, () => undefined);
    m.start();
    await flush();
    expect(m.state.error).toMatch(/no workspace/);
  });
});
