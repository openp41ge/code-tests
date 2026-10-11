/**
 * runExtensionGit: git for extension backends (`ctx.git`), scoped to the
 * calling window's workspace — the repo by name, never a path; no shell; no
 * options that make git run other programs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { runExtensionGit } from "@openp41ge/main/services/extension-git";
import { NodeGitService } from "@openp41ge/main/services/node-git-service";

const APP = "github.com/acme/app";
let root: string;
let reposDir: string;
const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "extension-git-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "a\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "first commit"]);
  reposDir = path.join(root, "repos");
  git(root, ["clone", "--bare", "--quiet", src, path.join(reposDir, APP, ".git")]);
  const main = await new NodeGitService(reposDir).checkoutWorktree(APP, "main");
  fs.writeFileSync(path.join(main.path, "a.txt"), "changed\n");
}, 20_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const scope = () => ({ reposDir, repoNames: [APP] });

describe("runExtensionGit", () => {
  it("runs in the repository", async () => {
    const r = await runExtensionGit(scope(), { repo: APP, args: ["log", "--format=%s"] });
    expect(r).toMatchObject({ ok: true, exitCode: 0, stdout: "first commit\n" });
  });

  it("runs in a worktree", async () => {
    const r = await runExtensionGit(scope(), {
      repo: APP,
      worktree: "main",
      args: ["status", "--porcelain"],
    });
    expect(r).toMatchObject({ ok: true, stdout: " M a.txt\n" });
  });

  it("reports a failing command with git's message", async () => {
    const r = await runExtensionGit(scope(), { repo: APP, args: ["show", "no-such-ref"] });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(128);
    expect(r.error).toMatch(/no-such-ref/);
  });

  it("passes arguments to git as they are (no shell)", async () => {
    const r = await runExtensionGit(scope(), { repo: APP, args: ["log", "--grep=x; touch pwned"] });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(reposDir, APP, "pwned"))).toBe(false);
  });

  it.each([
    ["no calling workspace", "none", { repo: APP, args: ["log"] }, /workspace/],
    [
      "a repo outside the workspace",
      "scope",
      { repo: "github.com/acme/other", args: ["log"] },
      /not a repository of this workspace/,
    ],
    [
      "a path for a repo",
      "scope",
      { repo: "../..", args: ["log"] },
      /not a repository of this workspace/,
    ],
    [
      "a worktree that is not checked out",
      "scope",
      { repo: APP, worktree: "nope", args: ["status"] },
      /worktree/,
    ],
    [
      "a global option first",
      "scope",
      { repo: APP, args: ["-c", "core.pager=sh", "log"] },
      /subcommand/,
    ],
    ["no arguments", "scope", { repo: APP, args: [] }, /subcommand/],
    [
      "--upload-pack",
      "scope",
      { repo: APP, args: ["fetch", "--upload-pack=sh", "origin"] },
      /runs other programs/,
    ],
    [
      "rebase --exec",
      "scope",
      { repo: APP, args: ["rebase", "--exec", "sh", "main"] },
      /runs other programs/,
    ],
    [
      "rebase -x",
      "scope",
      { repo: APP, args: ["rebase", "-x", "sh", "main"] },
      /runs other programs/,
    ],
    [
      "difftool --extcmd",
      "scope",
      { repo: APP, args: ["difftool", "--extcmd=sh"] },
      /runs other programs/,
    ],
    [
      "submodule foreach",
      "scope",
      { repo: APP, args: ["submodule", "foreach", "sh"] },
      /runs other programs/,
    ],
    ["bisect run", "scope", { repo: APP, args: ["bisect", "run", "sh"] }, /runs other programs/],
    ["filter-branch", "scope", { repo: APP, args: ["filter-branch"] }, /runs other programs/],
  ])("refuses %s", async (_what, s, request, message) => {
    const r = await runExtensionGit(s === "scope" ? scope() : null, request);
    expect(r).toMatchObject({ ok: false, exitCode: null });
    expect(r.error).toMatch(message);
  });
});
