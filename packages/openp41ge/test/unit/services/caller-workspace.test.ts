/**
 * callerWorkspace — the calling window's workspace for `ctx.workspace`: its
 * id, the checked-out worktrees of the repositories its workspace file lists,
 * and an extension's folder inside its data folder.
 */
import { describe, test, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { callerWorkspace } from "@openp41ge/main/services/caller-workspace";
import type { WorktreeInfo } from "@openp41ge/main/interfaces/git-service";

const worktrees: Record<string, WorktreeInfo[]> = {
  "github.com/a/app": [
    { branch: "main", path: "/r/github.com/a/app/main", exists: true },
    { branch: "gone", path: "/r/github.com/a/app/gone", exists: false },
  ],
  "github.com/a/web": [{ branch: "dev", path: "/r/github.com/a/web/dev", exists: true }],
  "github.com/a/other": [{ branch: "main", path: "/r/github.com/a/other/main", exists: true }],
};

function make(dataDir = "/data/ws1") {
  return callerWorkspace({
    workspace: { id: "ws1", dataDir },
    repoNames: () => ["github.com/a/app", "github.com/a/web", "github.com/a/missing"],
    listWorktrees: async (repoName) => worktrees[repoName] ?? [],
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
