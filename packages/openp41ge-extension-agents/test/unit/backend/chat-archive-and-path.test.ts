/**
 * Archived chats and a chat's folder. Archiving hides a chat from the default
 * list; listing with `archived` includes it (marked by `archivedAt`), and
 * unarchiving brings it back. A chat's folder on disk (its header and message
 * files, the conversation history) can be asked for, so it can be shared.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { HandlerContext, HandlerPayload } from "openp41ge-sdk";
import { ChatThreadStore } from "@openp41ge-extension-agents/backend/chat-thread-store";
import { AgentsBackend } from "@openp41ge-extension-agents/backend/agents-backend";
import { ChatProviderRegistry } from "@openp41ge-extension-agents/backend/chat-provider-registry";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-archive-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ChatThreadStore archive and folder", () => {
  it("lists archived chats only when asked, and unarchives them", () => {
    const store = new ChatThreadStore(dir);
    const kept = store.create({ title: "Kept" });
    const old = store.create({ title: "Old" });
    store.archive(old.id);

    expect(store.listSummaries().map((s) => s.id)).toEqual([kept.id]);
    const all = store.listSummaries({ archived: true });
    expect(all.map((s) => s.id).sort()).toEqual([kept.id, old.id].sort());
    expect(all.find((s) => s.id === old.id)?.archivedAt).toBeTypeOf("number");
    expect(all.find((s) => s.id === kept.id)?.archivedAt).toBeUndefined();

    expect(store.unarchive(old.id)).toBe(true);
    expect(store.unarchive(old.id)).toBe(false);
    expect(store.unarchive("nope")).toBe(false);
    expect(store.listSummaries().map((s) => s.id).sort()).toEqual([kept.id, old.id].sort());

    store.flush();
    const reloaded = new ChatThreadStore(dir);
    reloaded.init();
    expect(reloaded.get(old.id)?.archivedAt).toBeUndefined();
  });

  it("gives a chat's folder, which holds its history", () => {
    const store = new ChatThreadStore(dir);
    const c = store.create({ title: "Shared" });
    store.appendMessage(c.id, { id: "u1", role: "user", content: "hello" });
    store.flush();
    const folder = store.threadDir(c.id)!;
    expect(fs.readdirSync(folder)).toEqual(
      expect.arrayContaining(["thread.json", "messages-000001.jsonl"]),
    );
    expect(store.threadDir("nope")).toBeNull();
  });
});

describe("AgentsBackend archive and path commands", () => {
  let published: string[];
  let backend: AgentsBackend;
  const ctx = (): HandlerContext => ({
    extensionId: "openp41ge-extension-agents",
    publish: (topic) => published.push(topic),
    git: async () => ({ ok: false, exitCode: null, stdout: "", stderr: "" }),
    config: { get: () => ({}) },
    workspace: { id: "ws1", roots: async () => [], dataDir: async () => path.join(dir, "ws1") },
    windowId: "w1",
    log: { debug() {}, info() {}, warn() {}, error() {} } as unknown as HandlerContext["log"],
  });
  const run = (command: string, payload: HandlerPayload = {}) =>
    backend.commands()[command](payload, ctx());

  beforeEach(() => {
    published = [];
    backend = new AgentsBackend({ providers: new ChatProviderRegistry() });
  });
  afterEach(() => backend.dispose());

  it("lists archived chats when asked and unarchives, announcing the change", async () => {
    const { id } = (await run("create", { title: "Old" })) as { id: string };
    await run("archive", { id });
    expect(await run("list")).toEqual([]);
    const all = (await run("list", { archived: true })) as Array<{ id: string; archivedAt?: number }>;
    expect(all.map((c) => c.id)).toEqual([id]);
    expect(all[0].archivedAt).toBeTypeOf("number");

    published = [];
    expect(await run("unarchive", { id })).toBe(true);
    expect(published).toContain("changed");
    expect(((await run("list")) as Array<{ id: string }>).map((c) => c.id)).toEqual([id]);
  });

  it("answers a chat's folder in the workspace's data folder", async () => {
    const { id } = (await run("create", { title: "Shared" })) as { id: string };
    expect(await run("path", { id })).toBe(path.join(dir, "ws1", "chat-threads", id));
    expect(await run("path", { id: "nope" })).toBeNull();
  });
});
