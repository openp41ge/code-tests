/**
 * The chat-threads-per-workspace set (migrations/): chat threads move into
 * their workspaces' data folders — from the old single `chats.json` (to the
 * oldest workspace) and from the global `chat-threads/` folder (to the
 * workspace a thread names, else the oldest). Ported from the built-in
 * migration it replaces.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parseInstructionSet } from "@openp41ge/main/services/migrations/instruction-set";
import { runInstructionSet } from "@openp41ge/main/services/migrations/migration-runner";
import { inApp } from "@app-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const SET = parseInstructionSet(
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        APP_HERE,
        "../../../../../../migrations/2026-10-09-chat-threads-per-workspace.json",
      ),
      "utf-8",
    ),
  ),
);

const chats = [
  {
    id: "chat_a",
    title: "First",
    providerId: "vllm",
    createdAt: 10,
    updatedAt: 20,
    description: "desc",
    messages: [
      { id: "u1", role: "user", content: "hello", timestamp: 11 },
      {
        id: "a1",
        role: "assistant",
        content: "hi",
        timestamp: 12,
        toolCalls: [{ id: "tc1", name: "read_file", arguments: "{}", status: "done" }],
      },
    ],
  },
  {
    id: "chat_b",
    title: "Archived",
    providerId: "vllm",
    createdAt: 1,
    updatedAt: 2,
    archivedAt: 3,
    messages: [],
  },
];

let dir: string;
const wsDir = (id: string) => path.join(dir, "workspaces-data", id);
const writeWorkspace = (id: string, createdAt: string, dataDir = "") =>
  fs.writeFileSync(
    path.join(dir, "workspaces", `${id}.openp41ge-workspace`),
    JSON.stringify({ id, name: id, createdAt, dataDir, repos: [] }),
  );
/** A workspace's thread ids, as on disk. */
const threadIds = (id: string): string[] => {
  const root = path.join(wsDir(id), "chat-threads");
  return fs.existsSync(root) ? fs.readdirSync(root).sort() : [];
};
/** A thread as on disk: its header and its messages (all files, in order). */
const readThread = (id: string, chatId: string) => {
  const dir = path.join(wsDir(id), "chat-threads", chatId);
  const header = JSON.parse(fs.readFileSync(path.join(dir, "thread.json"), "utf-8"));
  const messages = (header.files as Array<{ name: string }>).flatMap((f) =>
    fs
      .readFileSync(path.join(dir, f.name), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l)),
  );
  return { header, messages };
};
const run = () => runInstructionSet(SET, { root: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-set-"));
  fs.mkdirSync(path.join(dir, "workspaces"));
  writeWorkspace("old", "2026-09-19T12:00:00.000Z");
  writeWorkspace("new", "2026-10-07T12:00:00.000Z");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the chat-threads-per-workspace set", () => {
  it("moves chats.json into the oldest workspace and keeps a backup", () => {
    fs.writeFileSync(
      path.join(dir, "chats.json"),
      JSON.stringify({ chats, openChats: { chat_a: "w" } }),
    );
    expect(run().error).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "chats.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "chats.json.migrated"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "chat-threads"))).toBe(false);
    const a = readThread("old", "chat_a");
    expect(a.header).toMatchObject({
      title: "First",
      createdAt: 10,
      updatedAt: 20,
      description: "desc",
      messageCount: 2,
      toolCallCount: 1,
      lastMessagePreview: "hi",
    });
    expect(a.messages).toEqual(chats[0].messages);
    expect(readThread("old", "chat_b").header.archivedAt).toBe(3);
    expect(threadIds("new")).toEqual([]);
  });

  it("moves global chat-threads folders to the workspace they name, else the oldest", () => {
    const global = path.join(dir, "chat-threads");
    const thread = (id: string, workspaceId?: string) => {
      fs.mkdirSync(path.join(global, id), { recursive: true });
      fs.writeFileSync(
        path.join(global, id, "thread.json"),
        JSON.stringify({
          version: 1,
          id,
          title: id,
          providerId: "vllm",
          createdAt: 1,
          updatedAt: 1,
          messageCount: 0,
          toolCallCount: 0,
          files: [],
          ...(workspaceId ? { workspaceId } : {}),
        }),
      );
    };
    thread("t_new", "new");
    thread("t_none");
    thread("t_unknown", "gone");
    expect(run().error).toBeUndefined();
    expect(fs.existsSync(global)).toBe(false);
    expect(threadIds("new")).toEqual(["t_new"]);
    expect(threadIds("old")).toEqual(["t_none", "t_unknown"]);
    const moved = JSON.parse(
      fs.readFileSync(path.join(wsDir("new"), "chat-threads", "t_new", "thread.json"), "utf-8"),
    );
    expect(moved.workspaceId).toBeUndefined();
  });

  it("uses a workspace file's own dataDir (inside the data folder)", () => {
    const custom = path.join(dir, "custom-data");
    writeWorkspace("old", "2026-09-01T00:00:00.000Z", custom);
    fs.writeFileSync(path.join(dir, "chats.json"), JSON.stringify({ chats }));
    expect(run().error).toBeUndefined();
    expect(fs.existsSync(path.join(custom, "chat-threads", "chat_a", "thread.json"))).toBe(true);
  });

  it("does nothing without old data, and a second run changes nothing", () => {
    expect(run()).toEqual({ ok: true, done: [] });
    fs.writeFileSync(path.join(dir, "chats.json"), JSON.stringify({ chats }));
    run();
    expect(run()).toEqual({ ok: true, done: [] });
  });

  it("leaves a corrupt chats.json in place without stopping", () => {
    fs.writeFileSync(path.join(dir, "chats.json"), "{nope");
    const result = run();
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, "chats.json"))).toBe(true);
    expect(result.done.join("\n")).toMatch(/left chats\.json/);
  });
});
