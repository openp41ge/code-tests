/**
 * AgentsBackend — the agents extension's commands (the old `chat:*` IPC):
 * threads of the calling window's workspace kept in the extension's data
 * folder there, "a chat is open in one window", the agent run with the
 * provider from the extension's config, and pushes as extension topics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { HandlerContext, HandlerPayload, HandlerWorkspace } from "openp41ge-sdk";
import { AgentsBackend } from "@openp41ge-extension-agents/backend/agents-backend";
import { ChatProviderRegistry } from "@openp41ge-extension-agents/backend/chat-provider-registry";
import type { ChatProviderConfig } from "@openp41ge-extension-agents/backend/chat-provider";

let dataDir: string;
let published: Array<{ topic: string; payload: unknown }>;
let config: Record<string, unknown>;
let providerConfigs: ChatProviderConfig[];

function providers(): ChatProviderRegistry {
  const registry = new ChatProviderRegistry();
  registry.register({
    id: "fake",
    label: "Fake",
    create: (cfg) => {
      providerConfigs.push(cfg);
      return {
        id: "fake",
        label: "Fake",
        ping: async () => cfg.baseUrl !== "down",
        async *streamChat() {
          yield { type: "text" as const, text: "hello back" };
        },
      };
    },
  });
  return registry;
}

function workspace(id = "ws1"): HandlerWorkspace {
  return {
    id,
    roots: async () => [{ repoName: "github.com/a/b", branch: "main", path: "/r/main" }],
    dataDir: async () => path.join(dataDir, id),
  };
}

function ctx(over: Partial<HandlerContext> = {}): HandlerContext {
  return {
    extensionId: "openp41ge-extension-agents",
    publish: (topic, payload) => published.push({ topic, payload }),
    git: async () => ({ ok: false, exitCode: null, stdout: "", stderr: "" }),
    config: { get: () => config },
    workspace: workspace(),
    windowId: "w1",
    log: { debug() {}, info() {}, warn() {}, error() {} } as unknown as HandlerContext["log"],
    ...over,
  };
}

let backend: AgentsBackend;
const run = (command: string, payload: HandlerPayload = {}, c: HandlerContext = ctx()) =>
  backend.commands()[command](payload, c);

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-backend-"));
  published = [];
  providerConfigs = [];
  config = {
    defaultProviderId: "fake",
    providers: { fake: { baseUrl: "http://fake/v1", defaultModel: "m1" } },
  };
  backend = new AgentsBackend({ providers: providers() });
});

afterEach(() => {
  backend.dispose();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("AgentsBackend threads", () => {
  it("keeps a workspace's threads in the extension's data folder there", async () => {
    const chat = (await run("create", { title: "First" })) as { id: string; title: string };
    expect(chat.title).toBe("First");
    expect(published).toContainEqual({ topic: "changed", payload: {} });

    const list = (await run("list")) as Array<{ id: string }>;
    expect(list.map((c) => c.id)).toEqual([chat.id]);
    backend.dispose(); // flush pending writes
    expect(fs.readdirSync(path.join(dataDir, "ws1", "chat-threads"))).toContain(chat.id);
  });

  it("a new chat uses defaultProviderId unless it picks a provider", async () => {
    expect(((await run("create")) as { providerId: string }).providerId).toBe("fake");
    const picked = (await run("create", { providerId: "other" })) as { providerId: string };
    expect(picked.providerId).toBe("other");
  });

  it("lists nothing for a window without a workspace", async () => {
    await run("create", { title: "First" });
    expect(await run("list", {}, ctx({ workspace: null }))).toEqual([]);
  });

  it("keeps workspaces apart", async () => {
    await run("create", { title: "In one" });
    const other = ctx({ workspace: workspace("ws2") });
    expect(await run("list", {}, other)).toEqual([]);
  });

  it("renames, archives and deletes, announcing each change", async () => {
    const { id } = (await run("create")) as { id: string };
    published = [];
    expect(((await run("rename", { id, title: "New" })) as { title: string }).title).toBe("New");
    expect(await run("archive", { id })).toBe(true);
    expect(await run("delete", { id })).toBe(true);
    expect(published.filter((p) => p.topic === "changed")).toHaveLength(3);
  });

  it("opens a chat in one window at a time", async () => {
    const { id } = (await run("create")) as { id: string };
    await run("open", { id });
    expect(await run("open-chats")).toEqual({ [id]: "here" });
    expect(await run("open-chats", {}, ctx({ windowId: "w2" }))).toEqual({ [id]: "elsewhere" });

    published = [];
    await run("open", { id }, ctx({ windowId: "w2" }));
    expect(await run("open-chats")).toEqual({ [id]: "here" });
    expect(published).toContainEqual({ topic: "open-state", payload: {} });

    await run("close", { id });
    expect(await run("open-chats")).toEqual({});
  });

  it("asks the window that has the chat open to highlight it", async () => {
    const { id } = (await run("create")) as { id: string };
    await run("open", { id });
    published = [];
    await run("highlight", { id }, ctx({ windowId: "w2" }));
    expect(published).toEqual([{ topic: "highlight", payload: { chatId: id, windowId: "w1" } }]);
  });
});

describe("AgentsBackend agent run", () => {
  it("runs the agent with the active provider from the config, streaming to the views", async () => {
    const { id } = (await run("create")) as { id: string };
    await run("open", { id });
    await run("send", { id, text: "hi" });

    expect(providerConfigs[0]).toMatchObject({ baseUrl: "http://fake/v1", defaultModel: "m1" });
    expect(published).toContainEqual({
      topic: "delta",
      payload: { chatId: id, delta: "hello back", windowId: "w1" },
    });
    const messages = (await run("messages", { id })) as { messages: Array<{ role: string }> };
    expect(messages.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("pings the active provider", async () => {
    expect(await run("ping-provider")).toEqual({ ok: true });
    config = { defaultProviderId: "fake", providers: { fake: { baseUrl: "down", defaultModel: "" } } };
    expect(await run("ping-provider")).toEqual({ ok: false, error: "Provider unreachable" });
    expect(await run("ping-provider", { providerId: "nope" })).toEqual({
      ok: false,
      error: "Unknown provider",
    });
  });

  it("lists the built-in tools", async () => {
    const tools = (await run("list-tools")) as Array<{ name: string }>;
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["read_file", "search_files"]));
  });

  it("lists and runs only the tools the config enables", async () => {
    config = { ...config, tools: { enabled: ["read_file"] } };
    const tools = (await run("list-tools")) as Array<{ name: string }>;
    expect(tools.map((t) => t.name)).toEqual(["read_file"]);

    const { id } = (await run("create")) as { id: string };
    await run("open", { id });
    const send = vi.spyOn(
      (
        backend as unknown as { _runtimeFor(): { send: (...a: unknown[]) => Promise<void> } }
      )._runtimeFor(),
      "send",
    );
    await run("send", { id, text: "hi", tools: ["read_file", "edit_file"] });
    expect(send.mock.calls[0][4]).toEqual(["read_file"]);
  });

  it("refuses a command that needs a chat id without one", async () => {
    await expect(run("get", {})).rejects.toThrow(/id/);
  });
});

describe("AgentsBackend dispose", () => {
  it("writes pending thread changes", async () => {
    const flush = vi.fn();
    const b = new AgentsBackend({ providers: providers() });
    await b.commands().create({}, ctx());
    // The store is created on first use; dispose flushes it.
    (b as unknown as { _threads: { flush(): void } })._threads.flush = flush;
    b.dispose();
    expect(flush).toHaveBeenCalled();
  });
});
