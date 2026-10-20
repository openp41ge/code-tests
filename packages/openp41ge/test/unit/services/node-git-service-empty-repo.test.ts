/**
 * NodeGitService with a repository that has no commits yet (a new, empty
 * GitHub repo): its default branch is unborn, so there is nothing to branch
 * from. Adding a worktree must still work — the branch starts unborn in its
 * own worktree — and a worktree that fails is logged as an error with git's
 * own message, so the user can see why.
 *
 * Regression (2026-10-20): adding any worktree to a fresh empty repo failed
 * with `fatal: not a valid object name: 'master'`, and nothing was logged.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const logged = vi.hoisted(() => ({ error: [] as string[] }));
vi.mock("openp41ge-core-logger", async (orig) => {
  const actual = await orig<typeof import("openp41ge-core-logger")>();
  return {
    ...actual,
    createLogger: () => ({
      debug() {},
      info() {},
      warn() {},
      error: (...args: unknown[]) => {
        logged.error.push(args.map(String).join(" "));
        return "err-1";
      },
    }),
  };
});

import { NodeGitService } from "../../../src/main/services/node-git-service";

function git(cwd: string, args: string[]): string {
  return execSync(`git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
  }).trim();
}

describe("NodeGitService — a repository with no commits", () => {
  let root: string;
  let reposDir: string;
  let svc: NodeGitService;
  const repoName = "github.com/example/empty";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-git-empty-"));
    const src = path.join(root, "src.git");
    git(root, ["init", "-q", "--bare", "-b", "master", src]);
    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", src, path.join(reposDir, repoName, ".git")]);
    svc = new NodeGitService(reposDir);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("checks out its unborn default branch as a worktree", async () => {
    const wt = await svc.checkoutWorktree(repoName, "master");
    expect(wt.exists).toBe(true);
    expect(git(wt.path, ["symbolic-ref", "--short", "HEAD"])).toBe("master");
  });

  it("creates a new branch as an unborn worktree", async () => {
    const wt = await svc.checkoutWorktree(repoName, "feature/one");
    expect(wt).toEqual({
      branch: "feature/one",
      path: path.join(reposDir, repoName, "feature--one"),
      exists: true,
    });
    expect(git(wt.path, ["symbolic-ref", "--short", "HEAD"])).toBe("feature/one");
  });

  it("lists worktrees whose branches have no commits yet", async () => {
    const branches = (await svc.listWorktrees(repoName)).map((w) => w.branch).sort();
    expect(branches).toEqual(["feature/one", "master"]);
  });

  it("branches from HEAD once the default branch has a commit", async () => {
    const master = path.join(reposDir, repoName, "master");
    fs.writeFileSync(path.join(master, "a.txt"), "a\n");
    git(master, ["add", "."]);
    git(master, ["-c", "user.name=t", "-c", "user.email=t@t.co", "commit", "-qm", "init"]);
    const wt = await svc.checkoutWorktree(repoName, "after");
    expect(git(wt.path, ["rev-parse", "HEAD"])).toBe(git(master, ["rev-parse", "HEAD"]));
  });

  it("logs a worktree that cannot be created, with git's message", async () => {
    logged.error.length = 0;
    await expect(svc.checkoutWorktree(repoName, "bad..name")).rejects.toThrow(/fatal/);
    expect(logged.error).toHaveLength(1);
    expect(logged.error[0]).toContain(repoName);
    expect(logged.error[0]).toContain("bad..name");
    expect(logged.error[0]).toContain("fatal");
  });
});
