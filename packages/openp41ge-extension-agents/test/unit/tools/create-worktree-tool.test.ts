/**
 * create_worktree tool — checks out a branch of a connected repository as a
 * worktree through the platform (the runtime's `addWorktree`), so a
 * repository with no worktree can be worked on.
 */

import { describe, it, expect, vi } from "vitest";
import createWorktreeTool from "@openp41ge-extension-agents/tools/create-worktree";

describe("create_worktree", () => {
  it("checks out the branch and says where", async () => {
    const addWorktree = vi.fn(async () => ({ ok: true, path: "/r/github.com/o/a/dev" }));
    const result = await createWorktreeTool.execute(
      { repo: "github.com/o/a", branch: "dev" },
      { roots: [], addWorktree },
    );
    expect(addWorktree).toHaveBeenCalledWith("github.com/o/a", "dev");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("/r/github.com/o/a/dev");
  });

  it("reports the platform's refusal in-band", async () => {
    const result = await createWorktreeTool.execute(
      { repo: "github.com/o/z", branch: "dev" },
      {
        addWorktree: async () => ({
          ok: false,
          error: "github.com/o/z is not a repository of this workspace",
        }),
      },
    );
    expect(result.error).toBe(
      "create_worktree: github.com/o/z is not a repository of this workspace",
    );
  });

  it("needs a repo and a branch, and a workspace to check out in", async () => {
    const addWorktree = vi.fn();
    expect((await createWorktreeTool.execute({ repo: "x" }, { addWorktree })).error).toMatch(
      /repo and branch/,
    );
    expect(addWorktree).not.toHaveBeenCalled();
    expect((await createWorktreeTool.execute({ repo: "x", branch: "y" }, {})).error).toMatch(
      /no workspace/,
    );
  });
});
