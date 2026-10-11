/**
 * runInstructionSet: runs a checked instruction set against a data folder,
 * step by step, stopping at the first failure; every path it touches stays
 * inside the folder.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { parseInstructionSet } from "@openp41ge/main/services/migrations/instruction-set";
import { runInstructionSet } from "@openp41ge/main/services/migrations/migration-runner";
import { NodeGitService } from "@openp41ge/main/services/node-git-service";
import { inApp } from "@code-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

let root: string;
const at = (...p: string[]) => path.join(root, ...p);
const write = (rel: string, text = "x") => {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), text);
};
const run = (steps: unknown[]) =>
  runInstructionSet(parseInstructionSet({ id: "t", description: "t", release: "0.0.0", steps }), {
    root,
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-runner-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("runInstructionSet — file operations", () => {
  it("moves, copies, makes folders and removes empty ones", () => {
    write("a/one.txt", "1");
    const result = run([
      { op: "mkdir", path: "b" },
      { op: "copy", from: "a/one.txt", to: "b/copy.txt" },
      { op: "move", from: "a/one.txt", to: "c/moved.txt" },
      { op: "removeIfEmpty", path: "a" },
    ]);
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(at("b/copy.txt"), "utf-8")).toBe("1");
    expect(fs.readFileSync(at("c/moved.txt"), "utf-8")).toBe("1");
    expect(fs.existsSync(at("a"))).toBe(false);
  });

  it("stops at a move onto something that exists, keeping both", () => {
    write("a.txt", "a");
    write("b.txt", "b");
    const result = run([
      { op: "move", from: "a.txt", to: "b.txt" },
      { op: "mkdir", path: "never" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exists/);
    expect(result.done).toEqual([]);
    expect(fs.readFileSync(at("b.txt"), "utf-8")).toBe("b");
    expect(fs.existsSync(at("never"))).toBe(false);
  });

  it("refuses a path that a variable takes outside the folder", () => {
    write("workspaces/w.openp41ge-workspace", JSON.stringify({ id: "w", dataDir: "/elsewhere/w" }));
    const result = run([
      { op: "forEachWorkspace", do: [{ op: "mkdir", path: "${workspace.dataDir}/x" }] },
    ]);
    // A workspace whose data folder is outside the data folder is skipped.
    expect(result.ok).toBe(true);
    expect(result.done).toEqual([]);
  });

  it("refuses a path that goes outside through a symlink", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "migration-outside-"));
    try {
      fs.symlinkSync(outside, at("link"));
      const result = run([{ op: "mkdir", path: "link/escaped" }]);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/outside the data folder/);
      expect(fs.existsSync(path.join(outside, "escaped"))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("does a step only when its condition holds", () => {
    write("present.txt");
    const result = run([
      { op: "if", exists: "present.txt", do: [{ op: "mkdir", path: "yes" }] },
      { op: "if", missing: "present.txt", do: [{ op: "mkdir", path: "no" }] },
    ]);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(at("yes"))).toBe(true);
    expect(fs.existsSync(at("no"))).toBe(false);
  });

  it("rewrites paths in JSON files", () => {
    write(
      "f.json",
      JSON.stringify({ a: path.join(root, "old", "x.txt"), b: ["/other", path.join(root, "old")] }),
    );
    const result = run([{ op: "rewriteJsonPaths", files: "f.json", from: "old", to: "new" }]);
    expect(result.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(at("f.json"), "utf-8"))).toEqual({
      a: path.join(root, "new", "x.txt"),
      b: ["/other", path.join(root, "new")],
    });
  });
});

describe("runInstructionSet — the repositories-per-workspace set (migrations/)", () => {
  const APP = "github.com/acme/app";
  /** The repo's own set (migrations/), as released. */
  const REPOS_MOVE = (
    JSON.parse(
      fs.readFileSync(
        path.resolve(
          APP_HERE,
          "../../../../../../migrations/2026-10-10-repositories-per-workspace.json",
        ),
        "utf-8",
      ),
    ) as { steps: unknown[] }
  ).steps;

  const git = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

  /** A shared clone of APP with a `main` worktree holding uncommitted work. */
  async function sharedClone(): Promise<{ main: string }> {
    const src = at("src");
    fs.mkdirSync(src);
    git(src, ["init", "-q", "-b", "main", "."]);
    fs.writeFileSync(path.join(src, "a.txt"), "a\n");
    git(src, ["add", "."]);
    git(src, ["commit", "-qm", "init"]);
    git(root, ["clone", "--bare", "--quiet", src, at("repositories", APP, ".git")]);
    const main = await new NodeGitService(at("repositories")).checkoutWorktree(APP, "main");
    fs.writeFileSync(path.join(main.path, "a.txt"), "uncommitted\n");
    return { main: main.path };
  }

  /** A workspace file listing APP, opened at `opened`, with a file tab. */
  function workspace(id: string, opened: string, tab?: string): void {
    write(
      `workspaces/${id}.openp41ge-workspace`,
      JSON.stringify({
        id,
        dataDir: "",
        lastActivatedAt: opened,
        repos: [{ url: "git@github.com:acme/app.git" }],
        editorTabs: tab ? { t: { config: { filePath: tab } } } : {},
      }),
    );
  }
  const tabOf = (id: string) =>
    JSON.parse(fs.readFileSync(at(`workspaces/${id}.openp41ge-workspace`), "utf-8")).editorTabs.t
      .config.filePath;

  it("moves the clone to its workspace, keeps its worktree working, rewrites saved paths", async () => {
    const { main } = await sharedClone();
    workspace("w", "2026-06-01T00:00:00Z", path.join(main, "a.txt"));

    const result = run(REPOS_MOVE);
    expect(result.error).toBeUndefined();
    const moved = at("workspaces-data", "w", "repositories", APP);
    expect(fs.existsSync(at("repositories"))).toBe(false);
    expect(git(path.join(moved, "main"), ["status", "--porcelain"])).toBe("M a.txt");
    expect(tabOf("w")).toBe(path.join(moved, "main", "a.txt"));

    // Run again: nothing left to do.
    expect(run(REPOS_MOVE)).toMatchObject({ ok: true, done: [] });
  }, 20_000);

  it("gives the clone to the most recently opened workspace; another's paths go to its own folder", async () => {
    const { main } = await sharedClone();
    workspace("old", "2026-01-01T00:00:00Z", path.join(main, "a.txt"));
    workspace("recent", "2026-06-01T00:00:00Z", path.join(main, "a.txt"));
    expect(run(REPOS_MOVE).error).toBeUndefined();
    expect(fs.existsSync(at("workspaces-data", "recent", "repositories", APP, ".git"))).toBe(true);
    expect(fs.existsSync(at("workspaces-data", "old", "repositories", APP))).toBe(false);
    // The other workspace clones it again when opened, into its own folder.
    expect(tabOf("old")).toBe(at("workspaces-data", "old", "repositories", APP, "main", "a.txt"));
  }, 20_000);

  it("relinks only worktrees inside the clone, never one elsewhere", async () => {
    await sharedClone();
    workspace("w", "2026-06-01T00:00:00Z");
    // A worktree outside the clone (e.g. a copied clone's record pointing at
    // the original): its .git file must stay as it was.
    const outside = at("elsewhere");
    git(at("repositories", APP), [
      "--git-dir=.git",
      "worktree",
      "add",
      "-q",
      outside,
      "-b",
      "side",
    ]);
    const before = fs.readFileSync(path.join(outside, ".git"), "utf-8");
    expect(run(REPOS_MOVE).error).toBeUndefined();
    expect(fs.readFileSync(path.join(outside, ".git"), "utf-8")).toBe(before);
  }, 20_000);

  it("keeps the shared clone when the workspace already has its own", async () => {
    await sharedClone();
    workspace("w", "2026-06-01T00:00:00Z");
    fs.mkdirSync(at("workspaces-data", "w", "repositories", APP, ".git"), { recursive: true });
    expect(run(REPOS_MOVE).error).toBeUndefined();
    expect(fs.existsSync(at("repositories", APP, "main", "a.txt"))).toBe(true);
  }, 20_000);
});
