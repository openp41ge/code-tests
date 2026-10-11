/**
 * Unit tests for ChatThreads: one thread store per workspace, kept in the
 * workspace's data folder, with by-id calls routed to the owning workspace.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { ChatThreads } from "@openp41ge-extension-agents/backend/chat-threads";

describe("ChatThreads", () => {
  let root: string;
  let threads: ChatThreads;
  const ws = (id: string) => ({ id, dataDir: path.join(root, "workspaces-data", id) });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-threads-reg-"));
    threads = new ChatThreads();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("keeps each workspace's threads in its data folder", () => {
    threads.useWorkspace(ws("a"));
    const t = threads.create("a", { title: "A" });
    threads.flush();
    expect(
      fs.existsSync(path.join(root, "workspaces-data", "a", "chat-threads", t.id, "thread.json")),
    ).toBe(true);
  });

  it("lists and searches only the workspace's own threads", () => {
    threads.useWorkspace(ws("a"));
    threads.useWorkspace(ws("b"));
    const a = threads.create("a", { title: "A" });
    const b = threads.create("b", { title: "B" });
    threads.appendMessage(a.id, { id: "u1", role: "user", content: "shared words" });
    threads.appendMessage(b.id, { id: "u2", role: "user", content: "shared words" });

    expect(threads.listSummaries("a").map((s) => s.id)).toEqual([a.id]);
    expect(threads.listSummaries("b").map((s) => s.id)).toEqual([b.id]);
    expect(threads.search("shared", {}, "a").map((r) => r.chatId)).toEqual([a.id]);
  });

  it("shows no threads to a window without a workspace, and refuses to create there", () => {
    threads.useWorkspace(ws("a"));
    threads.create("a");
    expect(threads.listSummaries(undefined)).toEqual([]);
    expect(threads.search("x", {}, undefined)).toEqual([]);
    expect(() => threads.create(undefined)).toThrow(/workspace/);
  });

  it("names the workspace that owns a thread", () => {
    threads.useWorkspace(ws("a"));
    threads.useWorkspace(ws("b"));
    const b = threads.create("b");
    expect(threads.workspaceOf(b.id)).toEqual(ws("b"));
    expect(threads.workspaceOf("missing")).toBeNull();
  });

  it("routes by-id calls to the workspace that owns the thread", () => {
    threads.useWorkspace(ws("a"));
    threads.useWorkspace(ws("b"));
    const b = threads.create("b", { title: "B" });
    expect(threads.appendMessage(b.id, { id: "u1", role: "user", content: "hi" })).toBe(true);
    expect(threads.updateMessage(b.id, "u1", (m) => (m.content = "edited"))).toBe(true);
    expect(threads.rename(b.id, "Renamed")?.title).toBe("Renamed");
    expect(threads.get(b.id)?.messages[0].content).toBe("edited");
    expect(threads.getHeader(b.id)?.totalMessages).toBe(1);
    expect(threads.getMessages(b.id, 0, 10).messages).toHaveLength(1);
    expect(threads.get("nope")).toBeNull();
    expect(threads.appendMessage("nope", { id: "x", role: "user", content: "" })).toBe(false);
    expect(threads.delete(b.id)).toBe(true);
    expect(threads.get(b.id)).toBeNull();
  });

  it("loads a workspace's saved threads when it is first used", () => {
    threads.useWorkspace(ws("a"));
    const t = threads.create("a", { title: "Saved" });
    threads.flush();

    const later = new ChatThreads();
    expect(later.get(t.id)).toBeNull();
    later.useWorkspace(ws("a"));
    later.useWorkspace(ws("a")); // loading twice is harmless
    expect(later.get(t.id)?.title).toBe("Saved");
    expect(later.listSummaries("a")).toHaveLength(1);
  });

  it("tracks which window a thread is open in, across workspaces", () => {
    threads.useWorkspace(ws("a"));
    const t = threads.create("a");
    let changes = 0;
    threads.onOpenStateChange(() => changes++);
    threads.markOpen(t.id, "win-a");
    expect(threads.getOpenWin(t.id)).toBe("win-a");
    expect(threads.isOpenElsewhere(t.id, "win-b")).toBe(true);
    expect(threads.getOpenChats()).toEqual({ [t.id]: "win-a" });
    threads.markClosed(t.id);
    expect(threads.getOpenWin(t.id)).toBeNull();
    expect(changes).toBe(2);
  });
});
