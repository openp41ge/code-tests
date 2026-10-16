// @vitest-environment node
/**
 * Unit tests for the open palette's file index: every file of the calling
 * workspace's worktrees (what git tracks, plus untracked files it does not
 * ignore), cached per worktree until a change under it or a timeout, and
 * matched by name in the main process so only the best go to the renderer.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceFileIndex, type FileLister } from "@openp41ge/main/services/workspace-file-index";
import { GitFileLister } from "@openp41ge/main/services/git-file-lister";

class FakeLister implements FileLister {
  calls = 0;
  constructor(public files: Record<string, string[]>) {}
  async list(root: string): Promise<string[]> {
    this.calls++;
    return this.files[root] ?? [];
  }
}

const roots = [
  { repoName: "gh/o/app", branch: "master", path: "/w/app" },
  { repoName: "gh/o/lib", branch: "dev", path: "/w/lib" },
];

describe("WorkspaceFileIndex", () => {
  it("finds files of every worktree, best match first, with where they are", async () => {
    const lister = new FakeLister({
      "/w/app": ["src/index.ts", "README.md"],
      "/w/lib": ["src/i/n/d/e/x.ts", "index.html"],
    });
    const index = new WorkspaceFileIndex(lister);
    const found = await index.search(roots, "index", 10);
    expect(found.map((f) => f.relPath)).toEqual(["src/index.ts", "index.html", "src/i/n/d/e/x.ts"]);
    expect(found[0]).toEqual({
      path: "/w/app/src/index.ts",
      relPath: "src/index.ts",
      repoName: "gh/o/app",
      branch: "master",
    });
  });

  it("returns at most `limit`", async () => {
    const lister = new FakeLister({ "/w/app": ["a1", "a2", "a3"] });
    expect(await new WorkspaceFileIndex(lister).search(roots, "a", 2)).toHaveLength(2);
  });

  it("caches a worktree's listing until a change under it", async () => {
    const lister = new FakeLister({ "/w/app": ["a.ts"], "/w/lib": [] });
    const index = new WorkspaceFileIndex(lister);
    await index.search(roots, "a", 10);
    await index.search(roots, "a", 10);
    expect(lister.calls).toBe(2);
    lister.files["/w/app"] = ["a.ts", "ab.ts"];
    index.invalidate("/w/app/ab.ts");
    expect((await index.search(roots, "ab", 10)).map((f) => f.relPath)).toEqual(["ab.ts"]);
    expect(lister.calls).toBe(3);
  });

  it("lists again after the timeout", async () => {
    let now = 0;
    const lister = new FakeLister({ "/w/app": ["a.ts"] });
    const index = new WorkspaceFileIndex(lister, { ttlMs: 1000, now: () => now });
    await index.search(roots.slice(0, 1), "a", 10);
    now = 1001;
    await index.search(roots.slice(0, 1), "a", 10);
    expect(lister.calls).toBe(2);
  });
});

describe("GitFileLister", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "file-index-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists tracked and untracked files, without ignored ones", async () => {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    await mkdir(join(dir, "node_modules"));
    await writeFile(join(dir, "node_modules", "x.js"), "");
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "tracked.ts"), "");
    execFileSync("git", ["add", "."], { cwd: dir });
    await writeFile(join(dir, "untracked.ts"), "");
    expect((await new GitFileLister().list(dir)).sort()).toEqual([
      ".gitignore",
      "src/tracked.ts",
      "untracked.ts",
    ]);
  });

  it("is empty for a folder that is not a repository", async () => {
    expect(await new GitFileLister().list(join(dir, "missing"))).toEqual([]);
  });
});
