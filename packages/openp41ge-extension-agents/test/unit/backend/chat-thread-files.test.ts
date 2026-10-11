/**
 * Unit tests for the chat-thread on-disk format: one folder per thread with a
 * small `thread.json` header and messages in size-bounded JSONL files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ChatMessage } from "@openp41ge-extension-agents/chat/types";
import {
  ChatThreadFiles,
  MESSAGES_SOFT_LIMIT,
  messageBytes,
  messageFileName,
  placeAppend,
  type ThreadHeader,
} from "@openp41ge-extension-agents/backend/chat-thread-files";

const msg = (id: string, content = "hi"): ChatMessage =>
  ({ id, role: "user", content, timestamp: 1 }) as ChatMessage;

const header = (over: Partial<ThreadHeader> = {}): ThreadHeader => ({
  version: 1,
  id: "t1",
  title: "Thread",
  providerId: "p",
  createdAt: 1,
  updatedAt: 2,
  messageCount: 0,
  toolCallCount: 0,
  files: [],
  ...over,
});

describe("messageFileName", () => {
  it("numbers files so they sort oldest first", () => {
    expect(messageFileName(1)).toBe("messages-000001.jsonl");
    expect(messageFileName(12)).toBe("messages-000012.jsonl");
  });
});

describe("placeAppend", () => {
  it("starts the first file for the first message", () => {
    const { files, fileIndex } = placeAppend([], 100);
    expect(fileIndex).toBe(0);
    expect(files).toEqual([{ name: "messages-000001.jsonl", count: 1, bytes: 100 }]);
  });

  it("keeps appending to the newest file while it is under the limit", () => {
    const start = [{ name: messageFileName(1), count: 3, bytes: MESSAGES_SOFT_LIMIT - 10 }];
    const { files, fileIndex } = placeAppend(start, 5000);
    // A message is never split: it goes whole into the file even though the
    // file then exceeds the soft limit (the wiggle room).
    expect(fileIndex).toBe(0);
    expect(files[0]).toEqual({
      name: messageFileName(1),
      count: 4,
      bytes: MESSAGES_SOFT_LIMIT + 4990,
    });
  });

  it("starts a new file once the newest has passed the limit", () => {
    const start = [{ name: messageFileName(1), count: 4, bytes: MESSAGES_SOFT_LIMIT + 1 }];
    const { files, fileIndex } = placeAppend(start, 10);
    expect(fileIndex).toBe(1);
    expect(files).toEqual([start[0], { name: messageFileName(2), count: 1, bytes: 10 }]);
  });

  it("puts a message larger than the limit whole into one file", () => {
    const { files } = placeAppend([], MESSAGES_SOFT_LIMIT * 3);
    expect(files).toEqual([{ name: messageFileName(1), count: 1, bytes: MESSAGES_SOFT_LIMIT * 3 }]);
  });
});

describe("ChatThreadFiles", () => {
  let root: string;
  let store: ChatThreadFiles;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-threads-"));
    store = new ChatThreadFiles(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("round-trips a header and a message file in the thread's folder", () => {
    const messages = [msg("a"), msg("b", "line\nbreak")];
    const bytes = store.writeMessages("t1", messageFileName(1), messages);
    expect(bytes).toBe(messages.reduce((n, m) => n + messageBytes(m), 0));
    store.writeHeader(
      header({ messageCount: 2, files: [{ name: messageFileName(1), count: 2, bytes }] }),
    );

    expect(fs.existsSync(path.join(root, "t1", "thread.json"))).toBe(true);
    expect(store.readMessages("t1", messageFileName(1))).toEqual(messages);
    expect(store.listHeaders()).toEqual([
      header({ messageCount: 2, files: [{ name: messageFileName(1), count: 2, bytes }] }),
    ]);
  });

  it("writes one message per line", () => {
    store.writeMessages("t1", messageFileName(1), [msg("a"), msg("b")]);
    const raw = fs.readFileSync(path.join(root, "t1", messageFileName(1)), "utf-8");
    expect(raw.trimEnd().split("\n")).toHaveLength(2);
  });

  it("skips a thread whose header is corrupt and keeps the others", () => {
    store.writeHeader(header({ id: "good" }));
    fs.mkdirSync(path.join(root, "bad"));
    fs.writeFileSync(path.join(root, "bad", "thread.json"), "{nope");
    expect(store.listHeaders().map((h) => h.id)).toEqual(["good"]);
  });

  it("reads a missing message file as empty and lists nothing for a missing root", () => {
    expect(store.readMessages("t1", messageFileName(1))).toEqual([]);
    expect(new ChatThreadFiles(path.join(root, "nope")).listHeaders()).toEqual([]);
  });

  it("leaves no temp files behind and deletes a thread's folder", () => {
    store.writeHeader(header());
    store.writeMessages("t1", messageFileName(1), [msg("a")]);
    expect(fs.readdirSync(path.join(root, "t1")).sort()).toEqual([
      messageFileName(1),
      "thread.json",
    ]);
    store.deleteThread("t1");
    expect(fs.existsSync(path.join(root, "t1"))).toBe(false);
  });

  it("removes one message file", () => {
    store.writeMessages("t1", messageFileName(1), [msg("a")]);
    store.writeMessages("t1", messageFileName(2), [msg("b")]);
    store.removeMessages("t1", messageFileName(1));
    expect(fs.readdirSync(path.join(root, "t1"))).toEqual([messageFileName(2)]);
    expect(() => store.removeMessages("t1", messageFileName(9))).not.toThrow();
  });

  it("refuses thread ids that would escape the root", () => {
    expect(() => store.writeHeader(header({ id: "../x" }))).toThrow();
    expect(() => store.readMessages("../x", messageFileName(1))).toThrow();
  });
});
