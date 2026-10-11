/**
 * RepositoryCleanup: deletes what nothing uses and that holds no work; lists
 * what it cannot safely delete (the manager window's Cleanup tab).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  RepositoryCleanup,
  type CleanupDeps,
  type RepoWork,
} from "@openp41ge/main/services/repository-cleanup";

const DAY = 24 * 60 * 60 * 1000;
let root: string;
let reposDir: string;
let dataDir: string;

/** A clone folder: `<reposDir>/<name>/.git` plus a worktree folder. */
function clone(dir: string, name: string): string {
  const repo = path.join(dir, name);
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, "main"), { recursive: true });
  fs.writeFileSync(path.join(repo, "main", "a.txt"), "a");
  return repo;
}

const clean = (repoName: string): RepoWork => ({
  repoName,
  branches: [{ branch: "main", worktree: true, staged: 0, unstaged: 0, untracked: 0, unpushed: 0 }],
  stashed: false,
});

function setup(over: Partial<CleanupDeps> = {}) {
  const work = new Map<string, RepoWork>();
  const deps: CleanupDeps = {
    appDataDir: dataDir,
    reposDirs: () => [reposDir],
    workspaces: () => ({
      files: [
        {
          file: "/w/live.openp41ge-workspace",
          workspace: { id: "live", dataDir: path.join(dataDir, "workspaces-data", "live") },
          name: "Live",
          repoNames: ["github.com/acme/used"],
        },
      ],
      complete: true,
    }),
    reposDirOf: () => reposDir,
    work: async (_dir, repoName) => work.get(repoName) ?? clean(repoName),
    isCloning: () => false,
    now: () => Date.now() + 2 * DAY, // every clone here is old enough
    ...over,
  };
  return { cleanup: new RepositoryCleanup(deps), work };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-cleanup-"));
  dataDir = path.join(root, "data");
  reposDir = path.join(dataDir, "repositories");
  fs.mkdirSync(reposDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("RepositoryCleanup — clones", () => {
  it("deletes an unused clone without work, keeps a used one", async () => {
    clone(reposDir, "github.com/acme/used");
    const unused = clone(reposDir, "github.com/acme/unused");
    const { cleanup } = setup();
    const result = await cleanup.run();
    expect(result.deleted).toEqual([unused]);
    expect(fs.existsSync(unused)).toBe(false);
    expect(fs.existsSync(path.join(reposDir, "github.com/acme/used/.git"))).toBe(true);
    expect(cleanup.list()).toEqual([]);
  });

  it("lists an unused clone with work instead, by worktree / branch", async () => {
    const unused = clone(reposDir, "github.com/acme/unused");
    const { cleanup, work } = setup();
    const dirty: RepoWork = {
      repoName: "github.com/acme/unused",
      branches: [
        { branch: "main", worktree: true, staged: 0, unstaged: 2, untracked: 0, unpushed: 0 },
      ],
      stashed: false,
    };
    work.set("github.com/acme/unused", dirty);
    const result = await cleanup.run();
    expect(result.deleted).toEqual([]);
    expect(fs.existsSync(unused)).toBe(true);
    expect(cleanup.list()).toEqual([
      { kind: "repository", path: unused, name: "github.com/acme/unused", repositories: [dirty] },
    ]);
  });

  it("lists a clone with a stash, or whose state cannot be read", async () => {
    clone(reposDir, "github.com/acme/stashed");
    clone(reposDir, "github.com/acme/broken");
    const { cleanup, work } = setup();
    work.set("github.com/acme/stashed", { ...clean("github.com/acme/stashed"), stashed: true });
    work.set("github.com/acme/broken", {
      repoName: "github.com/acme/broken",
      branches: [],
      stashed: false,
      error: "fatal: bad",
    });
    await cleanup.run();
    expect(
      cleanup
        .list()
        .map((i) => i.name)
        .sort(),
    ).toEqual(["github.com/acme/broken", "github.com/acme/stashed"]);
  });

  it("never touches a clone being cloned, or cloned less than a day ago", async () => {
    const cloning = clone(reposDir, "github.com/acme/cloning");
    const fresh = clone(reposDir, "github.com/acme/fresh");
    const { cleanup } = setup({
      isCloning: (_dir, name) => name === "github.com/acme/cloning",
      now: () => Date.now(),
    });
    const result = await cleanup.run();
    expect(result.deleted).toEqual([]);
    expect(fs.existsSync(cloning) && fs.existsSync(fresh)).toBe(true);
    expect(cleanup.list()).toEqual([]);
  });

  it("deletes empty folders, and the host / org folders a delete leaves empty", async () => {
    fs.mkdirSync(path.join(reposDir, "github.com/file/path"), { recursive: true });
    const unused = clone(reposDir, "gitlab.com/solo/unused");
    const { cleanup } = setup();
    const result = await cleanup.run();
    expect(fs.readdirSync(reposDir)).toEqual([]);
    expect(result.deleted.sort()).toEqual(
      [
        unused,
        path.join(reposDir, "github.com"),
        path.join(reposDir, "github.com/file"),
        path.join(reposDir, "github.com/file/path"),
        path.join(reposDir, "gitlab.com"),
        path.join(reposDir, "gitlab.com/solo"),
      ].sort(),
    );
  });
});

describe("RepositoryCleanup — inside clones", () => {
  it("leaves empty folders inside a clone's worktrees alone", async () => {
    const used = clone(reposDir, "github.com/acme/used");
    fs.mkdirSync(path.join(used, "main", "empty"), { recursive: true });
    const { cleanup } = setup();
    await cleanup.run();
    expect(fs.existsSync(path.join(used, "main", "empty"))).toBe(true);
  });
});

describe("RepositoryCleanup — workspace data folders", () => {
  const wsData = (id: string) => path.join(dataDir, "workspaces-data", id);

  it("deletes a deleted workspace's folder, chats included; keeps a live one", async () => {
    fs.mkdirSync(path.join(wsData("gone"), "chat-threads"), { recursive: true });
    fs.mkdirSync(path.join(wsData("live"), "chat-threads"), { recursive: true });
    const { cleanup } = setup();
    const result = await cleanup.run();
    expect(result.deleted).toEqual([wsData("gone")]);
    expect(fs.existsSync(wsData("live"))).toBe(true);
  });

  it("lists a deleted workspace's folder whose clone has work", async () => {
    clone(path.join(wsData("gone"), "repositories"), "github.com/acme/app");
    const { cleanup, work } = setup();
    work.set("github.com/acme/app", { ...clean("github.com/acme/app"), stashed: true });
    await cleanup.run();
    expect(fs.existsSync(wsData("gone"))).toBe(true);
    expect(cleanup.list()).toMatchObject([
      { kind: "workspace", path: wsData("gone"), name: "gone", repositories: [{ stashed: true }] },
    ]);
  });

  it("deletes no workspace folder when a workspace file could not be read", async () => {
    fs.mkdirSync(wsData("unknown"), { recursive: true });
    const { cleanup } = setup({ workspaces: () => ({ files: [], complete: false }) });
    await cleanup.run();
    expect(fs.existsSync(wsData("unknown"))).toBe(true);
  });

  it("deletes the old repos/ copies in a live workspace's folder", async () => {
    fs.mkdirSync(path.join(wsData("live"), "repos", "app"), { recursive: true });
    fs.writeFileSync(path.join(wsData("live"), "repos", "app", "README.md"), "x");
    const { cleanup } = setup();
    const result = await cleanup.run();
    expect(result.deleted).toEqual([path.join(wsData("live"), "repos")]);
    expect(fs.existsSync(wsData("live"))).toBe(true);
  });
});

describe("RepositoryCleanup — listed items", () => {
  it("deletes a listed item on request, and refuses any other path", async () => {
    const unused = clone(reposDir, "github.com/acme/unused");
    const { cleanup, work } = setup();
    work.set("github.com/acme/unused", { ...clean("github.com/acme/unused"), stashed: true });
    await cleanup.run();
    await expect(cleanup.delete(reposDir)).resolves.toMatchObject({ ok: false });
    expect(fs.existsSync(reposDir)).toBe(true);
    await expect(cleanup.delete(unused)).resolves.toEqual({ ok: true });
    expect(fs.existsSync(unused)).toBe(false);
    expect(cleanup.list()).toEqual([]);
  });

  it("reports changes to the list", async () => {
    clone(reposDir, "github.com/acme/unused");
    const { cleanup, work } = setup();
    work.set("github.com/acme/unused", { ...clean("github.com/acme/unused"), stashed: true });
    let changes = 0;
    cleanup.onChange(() => changes++);
    await cleanup.run();
    expect(changes).toBe(1);
    await cleanup.run(); // same list: no change
    expect(changes).toBe(1);
  });
});
