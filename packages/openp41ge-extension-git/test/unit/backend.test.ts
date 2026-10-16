/**
 * The git extension's backend commands: each runs its query through the
 * platform's `ctx.git` (the repo by name, in the caller's workspace) and
 * answers `{ ok: true, result }` or `{ ok: false, error }` — never throws.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { GitRequest, GitResult, HandlerContext } from "openp41ge-sdk";
import { GIT_COMMANDS } from "@openp41ge-extension-git/backend";
import { localGitRunner } from "../../../openp41ge-sdk-git/test/unit/local-git-runner";

const APP = "github.com/acme/app";
let root: string;
let ctx: HandlerContext;
let git: ReturnType<typeof vi.fn>;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "git-backend-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  const run = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf-8" });
  run(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "a\n");
  run(src, ["add", "."]);
  run(src, ["commit", "-qm", "first"]);
  const reposDir = path.join(root, "repos");
  run(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, APP, ".git")]);
  const local = localGitRunner(reposDir);
  // The platform's ctx.git, played by a local runner (only APP is known).
  git = vi.fn(async (req: GitRequest): Promise<GitResult> => {
    if (req.repo !== APP) {
      return {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: `${req.repo} is not a repository of this workspace`,
      };
    }
    try {
      const stdout = await local(req.repo, [...req.args], req.worktree);
      return { ok: true, exitCode: 0, stdout, stderr: "" };
    } catch (err) {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: String(err),
        error: (err as Error).message,
      };
    }
  });
  ctx = { extensionId: "openp41ge-extension-git", publish: () => {}, git } as HandlerContext;
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("git extension backend", () => {
  it("answers a query through ctx.git, naming the repo", async () => {
    const res = (await GIT_COMMANDS["commit-log"]({ repo: APP, branch: "main" }, ctx)) as {
      ok: boolean;
      result: Array<{ message: string }>;
    };
    expect(res.ok).toBe(true);
    expect(res.result.map((c) => c.message)).toEqual(["first"]);
    expect(git).toHaveBeenCalledWith(expect.objectContaining({ repo: APP }));
  });

  it("reports the platform's refusal as an error, without throwing", async () => {
    await expect(GIT_COMMANDS["branches"]({ repo: "github.com/acme/other" }, ctx)).resolves.toEqual(
      { ok: false, error: "github.com/acme/other is not a repository of this workspace" },
    );
  });

  it("refuses a request without a repo", async () => {
    await expect(GIT_COMMANDS["branches"]({}, ctx)).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/repo/),
    });
  });

  it("answers a file's inline diff at a commit", async () => {
    const res = (await GIT_COMMANDS["file-diff"](
      { repo: APP, path: "a.txt", hash: "HEAD" },
      ctx,
    )) as {
      ok: boolean;
      result: { text: string; rows: Array<{ kind: string }> };
    };
    expect(res.ok).toBe(true);
    expect(res.result.text).toBe("a");
    expect(res.result.rows.map((r) => r.kind)).toEqual(["added"]);
  });

  it("offers every query", () => {
    expect(Object.keys(GIT_COMMANDS).sort()).toEqual([
      "branches",
      "commit",
      "commit-log",
      "delete-branch",
      "diff-stat",
      "file-content",
      "file-diff",
      "file-hunks",
      "match-context",
      "search-commits-window",
      "uncommitted-files",
      "untracked-files",
    ]);
  });
});
