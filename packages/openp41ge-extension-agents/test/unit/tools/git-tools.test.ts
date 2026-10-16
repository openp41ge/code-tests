/**
 * The agent's git tools — git_log, git_show, git_diff, git_blame,
 * git_branches — on a real repository, through a stand-in for the platform's
 * `ctx.git` (the chat's workspace). They only read; output is compact text,
 * cut with a note on how to narrow it when large; errors are in-band.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { GitRequest, GitResult } from "openp41ge-sdk";
import { GIT_TOOLS } from "@openp41ge-extension-agents/tools/git";
import type { ToolExecutionContext } from "@openp41ge-extension-agents/tools/types";
import { localGitRunner } from "../../../../openp41ge-sdk-git/test/unit/local-git-runner";

const APP = "github.com/acme/app";
let root: string;
let ctx: ToolExecutionContext;
let requests: GitRequest[];

const tool = (name: string) => {
  const t = GIT_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
const run = (name: string, args: Record<string, unknown>, c: ToolExecutionContext = ctx) =>
  tool(name).execute(args, c);

const git = (cwd: string, args: string[], who = "ann", date = "2026-01-01T10:00:00Z") =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: who,
      GIT_AUTHOR_EMAIL: `${who}@t.co`,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: who,
      GIT_COMMITTER_EMAIL: `${who}@t.co`,
      GIT_COMMITTER_DATE: date,
    },
  }).trim();

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "one\ntwo\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "Add a"], "ann", "2026-01-01T10:00:00Z");
  fs.writeFileSync(
    path.join(src, "big.txt"),
    Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n"),
  );
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "Add big", "-m", "A long file."], "bob", "2026-02-01T10:00:00Z");
  const reposDir = path.join(root, "repos");
  const repoDir = path.join(reposDir, APP);
  git(root, ["clone", "--bare", "--quiet", src, path.join(repoDir, ".git")]);
  git(repoDir, [
    "--git-dir=.git",
    "config",
    "remote.origin.fetch",
    "+refs/heads/*:refs/remotes/origin/*",
  ]);
  git(repoDir, ["--git-dir=.git", "fetch", "-q", "origin"]);
  git(repoDir, ["--git-dir=.git", "worktree", "add", "-q", path.join(repoDir, "main"), "main"]);
  git(path.join(repoDir, "main"), ["branch", "--set-upstream-to=origin/main"]);
  fs.writeFileSync(path.join(repoDir, "main", "a.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(repoDir, "main", "new.txt"), "new\n");
  const local = localGitRunner(reposDir);
  requests = [];
  ctx = {
    git: async (req: GitRequest): Promise<GitResult> => {
      requests.push(req);
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
          exitCode: 128,
          stdout: "",
          stderr: String(err),
          error: (err as Error).message,
        };
      }
    },
  };
}, 20_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("the git tools", () => {
  it("are the five read-only tools", () => {
    expect(GIT_TOOLS.map((t) => t.name)).toEqual([
      "git_log",
      "git_show",
      "git_diff",
      "git_blame",
      "git_branches",
    ]);
  });

  it("only run subcommands that read", async () => {
    requests.length = 0;
    await run("git_log", { repo: APP });
    await run("git_show", { repo: APP, ref: "HEAD" });
    await run("git_diff", { repo: APP, branch: "main", files_only: true });
    await run("git_blame", { repo: APP, path: "a.txt", start_line: 1, end_line: 2 });
    await run("git_branches", { repo: APP });
    const subcommands = new Set(requests.map((r) => r.args[0]));
    for (const sub of subcommands) {
      expect(["log", "show", "diff", "diff-tree", "blame", "for-each-ref", "ls-files"]).toContain(
        sub,
      );
    }
  });

  it("report a missing workspace and a missing repo in-band", async () => {
    expect((await run("git_log", { repo: APP }, {})).error).toMatch(/no workspace/);
    expect((await run("git_log", {}, ctx)).error).toMatch(/repo is required/);
    expect((await run("git_log", { repo: "github.com/x/y" })).error).toMatch(
      /not a repository of this workspace/,
    );
  });
});

describe("git_log", () => {
  it("lists commits, one line each, newest first", async () => {
    const { content, error } = await run("git_log", { repo: APP });
    expect(error).toBeUndefined();
    const lines = content.split("\n").filter((l) => /^[0-9a-f]{7}/.test(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^[0-9a-f]{7,} 2026-02-01 bob +Add big( \(.*\))?$/);
    expect(lines[1]).toMatch(/2026-01-01 ann +Add a$/);
  });

  it("filters, and searches code", async () => {
    expect((await run("git_log", { repo: APP, author: "ann" })).content).not.toContain("Add big");
    expect((await run("git_log", { repo: APP, path: "a.txt" })).content).not.toContain("Add big");
    const found = await run("git_log", { repo: APP, search: "line 450", search_in: "code" });
    expect(found.content).toContain("Add big");
    expect(found.content).not.toContain("Add a");
  });

  it("says how to see more when the limit is reached", async () => {
    expect((await run("git_log", { repo: APP, limit: 1 })).content).toMatch(/skip: 1/);
  });

  it("refuses a ref that reads as an option", async () => {
    expect((await run("git_log", { repo: APP, ref: "--all" })).error).toMatch(/not a ref/);
  });
});

describe("git_show", () => {
  it("shows a commit: message, files and diff, cut per file with a note", async () => {
    const { content } = await run("git_show", { repo: APP, ref: "HEAD" });
    expect(content).toContain("Author: bob");
    expect(content).toContain("A long file.");
    expect(content).toMatch(/big\.txt \+900/);
    expect(content).toContain("+line 0");
    expect(content).not.toContain("+line 899");
    expect(content).toMatch(/cut.*pass its path/);
  });

  it("shows only the files with stat_only, and one file's diff with path", async () => {
    const stat = await run("git_show", { repo: APP, ref: "HEAD", stat_only: true });
    expect(stat.content).toMatch(/big\.txt/);
    expect(stat.content).not.toContain("+line 0");
    const first = await run("git_show", { repo: APP, ref: "HEAD~1", path: "a.txt" });
    expect(first.content).toContain("+one");
  });

  it("shows a file as it was at a ref", async () => {
    const { content } = await run("git_show", {
      repo: APP,
      ref: "HEAD~1",
      path: "a.txt",
      file_content: true,
    });
    expect(content).toContain("one\ntwo");
  });
});

describe("git_diff", () => {
  it("lists a worktree's uncommitted files, untracked ones too", async () => {
    const { content } = await run("git_diff", { repo: APP, branch: "main", files_only: true });
    expect(content).toMatch(/a\.txt/);
    expect(content).toMatch(/new\.txt.*untracked|untracked.*new\.txt/s);
  });

  it("shows a worktree's changes", async () => {
    expect((await run("git_diff", { repo: APP, branch: "main" })).content).toContain("+three");
  });

  it("diffs two refs", async () => {
    const { content } = await run("git_diff", {
      repo: APP,
      from: "HEAD~1",
      to: "HEAD",
      files_only: true,
    });
    expect(content).toMatch(/A\s+big\.txt/);
  });

  it("needs a worktree branch or refs", async () => {
    expect((await run("git_diff", { repo: APP })).error).toMatch(/branch.*from/);
  });
});

describe("git_blame", () => {
  it("names the commit and author of each line", async () => {
    const { content } = await run("git_blame", {
      repo: APP,
      path: "a.txt",
      start_line: 1,
      end_line: 2,
    });
    const lines = content.split("\n").filter((l) => /^\s*\d+ /.test(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/1 [0-9a-f]{7} 2026-01-01 ann +one$/);
  });

  it("blames a worktree's file, uncommitted lines included", async () => {
    const { content } = await run("git_blame", {
      repo: APP,
      path: "a.txt",
      branch: "main",
      start_line: 3,
      end_line: 3,
    });
    expect(content).toMatch(/3 uncommitted +three/);
  });

  it("allows at most 200 lines", async () => {
    expect(
      (await run("git_blame", { repo: APP, path: "big.txt", start_line: 1, end_line: 500 })).error,
    ).toMatch(/200 lines/);
  });
});

describe("git_branches", () => {
  it("lists local branches with upstream and last commit, and remote branches", async () => {
    const { content } = await run("git_branches", { repo: APP });
    expect(content).toMatch(/main → origin\/main \(up to date\)/);
    expect(content).toContain("Add big");
    expect(content).toMatch(/Remote:\s*\n\s*origin\/main/);
  });
});
