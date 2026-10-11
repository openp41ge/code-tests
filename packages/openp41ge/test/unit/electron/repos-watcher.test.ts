/**
 * Which changes under `.git` the repositories watcher reports: the ones that
 * change a branch's state (refs, a worktree's HEAD / index) — not objects,
 * logs or lock files.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import { isGitStatePath } from "../../../electron/repos-watcher";

const rel = (p: string) => p.split("/").join(path.sep);

describe("isGitStatePath", () => {
  it("reports refs, packed-refs, HEAD and a worktree's HEAD / index", () => {
    for (const p of [
      "github.com/a/b/.git/refs/heads/main",
      "github.com/a/b/.git/refs/heads/feat/x",
      "github.com/a/b/.git/refs/remotes/origin/main",
      "github.com/a/b/.git/packed-refs",
      "github.com/a/b/.git/HEAD",
      "github.com/a/b/.git/worktrees/main/HEAD",
      "github.com/a/b/.git/worktrees/main/index",
    ]) {
      expect(isGitStatePath(rel(p)), p).toBe(true);
    }
  });

  it("skips objects, logs, lock files and anything outside .git", () => {
    for (const p of [
      "github.com/a/b/.git/objects/ab/cdef",
      "github.com/a/b/.git/worktrees/main/logs/HEAD",
      "github.com/a/b/.git/refs/heads/main.lock",
      "github.com/a/b/.git/worktrees/main/index.lock",
      "github.com/a/b/.git/config",
      "github.com/a/b/main/src/x.ts",
      "github.com/a/b/main/node_modules/.git/HEAD",
    ]) {
      expect(isGitStatePath(rel(p)), p).toBe(false);
    }
  });
});
