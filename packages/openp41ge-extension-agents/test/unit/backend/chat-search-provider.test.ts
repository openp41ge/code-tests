/**
 * The agents extension's palette search provider: the calling workspace's
 * chats (newest first, those open in another window left out), matched by
 * title, and "New chat", which creates one and returns it to open.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { HandlerContext, HandlerWorkspace, SearchItem } from "openp41ge-sdk";
import { AgentsBackend, CHAT_OPEN_KIND } from "@openp41ge-extension-agents/backend/agents-backend";
import { ChatProviderRegistry } from "@openp41ge-extension-agents/backend/chat-provider-registry";

let dataDir: string;
let backend: AgentsBackend;

function workspace(id = "ws1"): HandlerWorkspace {
  return {
    id,
    roots: async () => [],
    repositories: async () => [],
    addWorktree: async () => ({ ok: false }),
    dataDir: async () => path.join(dataDir, id),
  };
}

function ctx(windowId = "w1"): HandlerContext {
  return {
    extensionId: "openp41ge-extension-agents",
    publish: () => undefined,
    git: async () => ({ ok: false, exitCode: null, stdout: "", stderr: "" }),
    config: { get: () => ({ defaultProviderId: "fake", providers: {} }) },
    workspace: workspace(),
    windowId,
    log: { debug() {}, info() {}, warn() {}, error() {} } as unknown as HandlerContext["log"],
  };
}

const run = (command: string, payload: Record<string, unknown> = {}, c = ctx()) =>
  backend.commands()[command](payload, c);

const titles = (items: readonly SearchItem[]) => items.map((i) => i.title);

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-search-"));
  backend = new AgentsBackend({ providers: new ChatProviderRegistry() });
});

describe("agents search provider", () => {
  it("offers New chat, then the workspace's chats, newest first", async () => {
    await run("create", { title: "First" });
    await new Promise((r) => setTimeout(r, 5));
    await run("create", { title: "Second" });
    const items = await backend.searchProvider().search("", ctx());
    expect(titles(items)).toEqual(["New chat", "Second", "First"]);
    expect(items[1]).toMatchObject({
      kind: CHAT_OPEN_KIND,
      params: { chatId: expect.any(String) },
    });
    expect((items[1] as { key?: string }).key).toBe(
      (items[1] as { params: { chatId: string } }).params.chatId,
    );
  });

  it("returns the chats whose title has the query's letters in order", async () => {
    await run("create", { title: "Release notes" });
    await run("create", { title: "Bug hunt" });
    const items = await backend.searchProvider().search("rel", ctx());
    expect(titles(items)).toEqual(["New chat", "Release notes"]);
  });

  it("leaves out a chat open in another window", async () => {
    const chat = (await run("create", { title: "Busy" })) as { id: string };
    await run("open", { id: chat.id }, ctx("w2"));
    expect(titles(await backend.searchProvider().search("", ctx("w1")))).toEqual(["New chat"]);
  });

  it("creates a chat for New chat and returns it to open", async () => {
    const provider = backend.searchProvider();
    const made = await provider.create!("new-chat", "", ctx());
    expect(made).toMatchObject({ kind: CHAT_OPEN_KIND, params: { chatId: expect.any(String) } });
    const listed = (await run("list")) as Array<{ id: string }>;
    expect(listed.map((c) => c.id)).toEqual([(made as { key: string }).key]);
  });

  it("creates nothing for an action it does not know", async () => {
    expect(await backend.searchProvider().create!("nope", "", ctx())).toBeNull();
  });
});
