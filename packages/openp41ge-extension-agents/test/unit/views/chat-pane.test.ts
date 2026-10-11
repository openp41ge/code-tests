/**
 * ChatPane — the chat grid tab's logic between the surface host and the
 * `<agents-chat>` element: it claims the chat for this window while the tab
 * exists, loads the transcript (whole, or the tail page of a long one),
 * feeds the element the backend's pushes for this chat, gives the composer
 * the configured providers and the enabled tools, and sends.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatPane,
  type ChatElement,
  type ChatPaneHost,
} from "@openp41ge-extension-agents/views/chat-pane";

type Handler = (payload: unknown) => void;

let topics: Map<string, Set<Handler>>;
let configListeners: Set<(c: Record<string, unknown>) => void>;
let calls: Array<{ command: string; payload: unknown }>;
let answers: Record<string, unknown>;
let config: Record<string, unknown>;

function host(params: Record<string, unknown> = { chatId: "c1" }): ChatPaneHost {
  return {
    context: params,
    dispatch: vi.fn(async (command: string, payload?: unknown) => {
      calls.push({ command, payload });
      const answer = answers[command];
      return typeof answer === "function" ? (answer as (p: unknown) => unknown)(payload) : answer;
    }),
    subscribe: (topic, fn) => {
      let set = topics.get(topic);
      if (!set) topics.set(topic, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    config: {
      get: () => config,
      subscribe: (fn) => {
        configListeners.add(fn);
        return () => configListeners.delete(fn);
      },
      openEditor: vi.fn(),
    },
    log: { debug() {}, info() {}, warn() {}, error: vi.fn() },
  };
}

function element(): ChatElement & Record<string, ReturnType<typeof vi.fn>> {
  return {
    title: "",
    setChat: vi.fn(),
    openTranscriptPaged: vi.fn(),
    appendDelta: vi.fn(),
    appendReasoning: vi.fn(),
    setToolCallState: vi.fn(),
    setProviderStatus: vi.fn(),
    setUsage: vi.fn(),
    setStreamRate: vi.fn(),
    setTitle: vi.fn(),
    setComposerContext: vi.fn(),
  } as unknown as ChatElement & Record<string, ReturnType<typeof vi.fn>>;
}

const push = (topic: string, payload: unknown) => {
  for (const fn of topics.get(topic) ?? []) fn(payload);
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  topics = new Map();
  configListeners = new Set();
  calls = [];
  config = {
    providerId: "vllm",
    providers: {
      vllm: {
        baseUrl: "http://x/v1",
        defaultModel: "m1",
        models: [{ id: "m1", contextWindow: 8 }],
      },
    },
  };
  answers = {
    header: { id: "c1", title: "Chat one", providerId: "vllm", totalMessages: 2 },
    get: {
      id: "c1",
      title: "Chat one",
      providerId: "vllm",
      createdAt: 1,
      updatedAt: 2,
      messages: [],
    },
    "list-tools": [{ name: "read_file", description: "Read" }],
  };
});

describe("ChatPane", () => {
  it("claims the chat for this window and loads it", async () => {
    const el = element();
    const pane = new ChatPane(host(), el);
    pane.start();
    await flush();
    expect(calls[0]).toEqual({ command: "open", payload: { id: "c1" } });
    expect(el.setChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", title: "Chat one" }),
    );
    pane.stop();
    expect(calls.at(-1)).toEqual({ command: "close", payload: { id: "c1" } });
  });

  it("opens a long chat at its last page", async () => {
    answers.header = { id: "c1", title: "Long", providerId: "vllm", totalMessages: 500 };
    answers.messages = { total: 500, offset: 300, messages: [] };
    const el = element();
    new ChatPane(host(), el).start();
    await flush();
    expect(calls).toContainEqual({
      command: "messages",
      payload: { id: "c1", offset: 300, count: 200 },
    });
    expect(el.openTranscriptPaged).toHaveBeenCalled();
  });

  it("feeds the element this chat's pushes only", async () => {
    const el = element();
    new ChatPane(host(), el).start();
    await flush();
    push("delta", { chatId: "c1", delta: "he" });
    push("delta", { chatId: "other", delta: "x" });
    push("reasoning", { chatId: "c1", delta: "hmm" });
    push("tool", { chatId: "c1", toolCall: { id: "t" }, result: "r" });
    push("status", { chatId: "c1", status: { streaming: true } });
    push("usage", { chatId: "c1", usage: { totalTokens: 3 } });
    push("live-rate", { chatId: "c1", tps: 12 });
    expect(el.appendDelta.mock.calls).toEqual([["he"]]);
    expect(el.appendReasoning).toHaveBeenCalledWith("hmm");
    expect(el.setToolCallState).toHaveBeenCalledWith({ id: "t" }, "r");
    expect(el.setProviderStatus).toHaveBeenCalledWith({ streaming: true });
    expect(el.setUsage).toHaveBeenCalledWith({ totalTokens: 3 });
    expect(el.setStreamRate).toHaveBeenCalledWith(12);
  });

  it("gives the composer the configured providers and the enabled tools", async () => {
    const el = element();
    new ChatPane(host(), el).start();
    await flush();
    expect(el.setComposerContext).toHaveBeenCalledWith({
      providers: [
        {
          id: "vllm",
          label: "vllm",
          defaultModel: "m1",
          baseUrl: "http://x/v1",
          models: [{ id: "m1", contextWindow: 8 }],
        },
      ],
      activeProviderId: "vllm",
      activeModelId: "m1",
      availableTools: [{ name: "read_file", description: "Read" }],
      activeTools: ["read_file"],
    });

    // A config change refreshes it.
    el.setComposerContext.mockClear();
    for (const fn of configListeners) fn(config);
    await flush();
    expect(el.setComposerContext).toHaveBeenCalled();
  });

  it("sends with the chosen tools and thinking level, and aborts", async () => {
    const el = element();
    const pane = new ChatPane(host({ chatId: "c1", cwd: "/w" }), el);
    pane.start();
    await flush();
    pane.toolsChanged([]);
    pane.send("hello", "High");
    pane.abort();
    expect(calls).toContainEqual({
      command: "send",
      payload: { id: "c1", text: "hello", cwd: "/w", tools: [], thinkingLevel: "High" },
    });
    expect(calls).toContainEqual({ command: "abort", payload: { id: "c1" } });
  });

  it("updates the title when the chat is renamed", async () => {
    const el = element();
    new ChatPane(host(), el).start();
    await flush();
    answers.get = { id: "c1", title: "Renamed", providerId: "vllm", messages: [] };
    push("changed", {});
    await flush();
    expect(el.setTitle).toHaveBeenCalledWith("Renamed");
  });

  it("stops listening when stopped", async () => {
    const el = element();
    const pane = new ChatPane(host(), el);
    pane.start();
    await flush();
    pane.stop();
    push("delta", { chatId: "c1", delta: "late" });
    expect(el.appendDelta).not.toHaveBeenCalled();
    expect(configListeners.size).toBe(0);
  });

  it("shows a missing chat as not found", async () => {
    answers.header = null;
    const el = element();
    new ChatPane(host(), el).start();
    await flush();
    expect(el.setChat).toHaveBeenCalledWith(expect.objectContaining({ title: "Chat not found" }));
  });
});
