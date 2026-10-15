/**
 * callerWorkspace — the calling window's workspace for `ctx.workspace`: its
 * id, the repositories its workspace file lists and their checked-out
 * worktrees, checking out a new worktree, and an extension's folder inside
 * its data folder.
 */
import { describe, test, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { callerWorkspace } from "@openp41ge/main/services/caller-workspace";
import type { CallerWorkspaceOptions } from "@openp41ge/main/services/caller-workspace";
import type { WorktreeInfo } from "@openp41ge/main/interfaces/git-service";

const worktrees: Record<string, WorktreeInfo[]> = {
  "github.com/a/app": [
    { branch: "main", path: "/r/github.com/a/app/main", exists: true },
    { branch: "gone", path: "/r/github.com/a/app/gone", exists: false },
  ],
  "github.com/a/web": [{ branch: "dev", path: "/r/github.com/a/web/dev", exists: true }],
  "github.com/a/other": [{ branch: "main", path: "/r/github.com/a/other/main", exists: true }],
};

const cloned = new Set(["github.com/a/app", "github.com/a/web", "github.com/a/bare"]);

function make(dataDir = "/data/ws1", overrides: Partial<CallerWorkspaceOptions> = {}) {
  return callerWorkspace({
    workspace: { id: "ws1", dataDir },
    repoNames: () => [
      "github.com/a/app",
      "github.com/a/web",
      "github.com/a/bare",
      "github.com/a/missing",
    ],
    isCloned: async (repoName) => cloned.has(repoName),
    listWorktrees: async (repoName) => worktrees[repoName] ?? [],
    checkoutWorktree: async (repoName, branch) => ({
      branch,
      path: `/r/${repoName}/${branch.replace(/\//g, "--")}`,
      exists: true,
    }),
    recordWorktree: () => undefined,
    ...overrides,
  });
}

describe("callerWorkspace", () => {
  test("lists the existing worktrees of the repositories the workspace lists", async () => {
    const ws = make();
    expect(ws.id).toBe("ws1");
    expect(await ws.roots()).toEqual([
      { repoName: "github.com/a/app", branch: "main", path: "/r/github.com/a/app/main" },
      { repoName: "github.com/a/web", branch: "dev", path: "/r/github.com/a/web/dev" },
    ]);
  });

  test("lists every repository the workspace lists, with or without a worktree", async () => {
    expect(await make().repositories()).toEqual([
      {
        repoName: "github.com/a/app",
        cloned: true,
        worktrees: [
          { repoName: "github.com/a/app", branch: "main", path: "/r/github.com/a/app/main" },
        ],
      },
      {
        repoName: "github.com/a/web",
        cloned: true,
        worktrees: [
          { repoName: "github.com/a/web", branch: "dev", path: "/r/github.com/a/web/dev" },
        ],
      },
      { repoName: "github.com/a/bare", cloned: true, worktrees: [] },
      { repoName: "github.com/a/missing", cloned: false, worktrees: [] },
    ]);
  });

  test("checks out a worktree and records it in the workspace file", async () => {
    const checkoutWorktree = vi.fn(async (repoName: string, branch: string) => ({
      branch,
      path: `/r/${repoName}/${branch.replace(/\//g, "--")}`,
      exists: true,
    }));
    const recordWorktree = vi.fn();
    const ws = make(undefined, { checkoutWorktree, recordWorktree });
    expect(await ws.addWorktree("github.com/a/bare", " feat/x ")).toEqual({
      ok: true,
      path: "/r/github.com/a/bare/feat--x",
    });
    expect(checkoutWorktree).toHaveBeenCalledWith("github.com/a/bare", "feat/x");
    expect(recordWorktree).toHaveBeenCalledWith("github.com/a/bare", "feat/x");
  });

  test("refuses a worktree of a repository the workspace does not list, or has not cloned", async () => {
    const checkoutWorktree = vi.fn();
    const ws = make(undefined, { checkoutWorktree });
    expect(await ws.addWorktree("github.com/a/other", "main")).toEqual({
      ok: false,
      error: "github.com/a/other is not a repository of this workspace",
    });
    expect(await ws.addWorktree("github.com/a/missing", "main")).toEqual({
      ok: false,
      error: "github.com/a/missing is not cloned yet",
    });
    expect(await ws.addWorktree("github.com/a/app", "  ")).toEqual({
      ok: false,
      error: "a repository and branch are required",
    });
    expect(checkoutWorktree).not.toHaveBeenCalled();
  });

  test("reports a failed checkout without recording it", async () => {
    const recordWorktree = vi.fn();
    const ws = make(undefined, {
      checkoutWorktree: async () => {
        throw new Error("fatal: invalid reference");
      },
      recordWorktree,
    });
    expect(await ws.addWorktree("github.com/a/app", "x")).toEqual({
      ok: false,
      error: "fatal: invalid reference",
    });
    expect(recordWorktree).not.toHaveBeenCalled();
  });

  test("makes an extension's folder inside the workspace's data folder", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-caller-ws-"));
    try {
      const dir = await make(dataDir).dataDirFor("openp41ge-extension-agents");
      expect(dir).toBe(path.join(dataDir, "extensions", "openp41ge-extension-agents"));
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("refuses an extension id that is not a single folder name", async () => {
    for (const id of ["", "..", "a/b", "a\\b", "."]) {
      await expect(make().dataDirFor(id)).rejects.toThrow(/not a valid extension id/);
    }
  });
});
