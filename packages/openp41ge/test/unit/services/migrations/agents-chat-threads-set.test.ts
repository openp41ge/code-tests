/**
 * The agents-chat-threads set (migrations/): each workspace's chat threads
 * move into the agents extension's folder there, where the extension keeps
 * them (`<workspace data>/extensions/openp41ge-extension-agents/chat-threads`).
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
      path.resolve(APP_HERE, "../../../../../../migrations/2026-10-10-agents-chat-threads.json"),
      "utf-8",
    ),
  ),
);

let dir: string;
const wsDir = (id: string) => path.join(dir, "workspaces-data", id);
const extDir = (id: string) =>
  path.join(wsDir(id), "extensions", "openp41ge-extension-agents", "chat-threads");
const writeWorkspace = (id: string) =>
  fs.writeFileSync(
    path.join(dir, "workspaces", `${id}.openp41ge-workspace`),
    JSON.stringify({ id, name: id, createdAt: "2026-10-01T00:00:00.000Z", repos: [] }),
  );
const writeThread = (root: string, id: string) => {
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(path.join(root, id, "thread.json"), JSON.stringify({ id }));
};
const run = () => runInstructionSet(SET, { root: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-set-"));
  fs.mkdirSync(path.join(dir, "workspaces"));
  writeWorkspace("one");
  writeWorkspace("two");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the agents-chat-threads set", () => {
  it("moves each workspace's threads into the agents extension's folder", () => {
    writeThread(path.join(wsDir("one"), "chat-threads"), "t1");
    writeThread(path.join(wsDir("two"), "chat-threads"), "t2");
    expect(run().error).toBeUndefined();
    expect(fs.readdirSync(extDir("one"))).toEqual(["t1"]);
    expect(fs.readdirSync(extDir("two"))).toEqual(["t2"]);
    expect(fs.existsSync(path.join(wsDir("one"), "chat-threads"))).toBe(false);
  });

  it("leaves threads the extension already has, and a workspace without threads", () => {
    writeThread(path.join(wsDir("one"), "chat-threads"), "old");
    writeThread(extDir("one"), "new");
    expect(run().error).toBeUndefined();
    expect(fs.readdirSync(extDir("one"))).toEqual(["new"]);
    expect(fs.existsSync(extDir("two"))).toBe(false);
  });

  it("changes nothing on a second run", () => {
    writeThread(path.join(wsDir("one"), "chat-threads"), "t1");
    run();
    expect(run()).toEqual({ ok: true, done: [] });
  });
});
