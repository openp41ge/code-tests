/**
 * GitQueries.getFileDiff on a real repository: one file as an inline diff
 * document (the whole file, removed lines spliced in) — at a commit, or a
 * worktree's file against HEAD (changed, new and untracked, deleted, clean);
 * and the worktree's uncommitted files.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { GitQueries } from "@openp41ge-extension-git/git-queries";
import { localGitRunner } from "./local-git-runner";

const APP = "github.com/acme/app";
let root: string;
let q: GitQueries;
let second = "";
const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.co",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.co",
    },
  }).trim();

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "git-file-diff-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(src, "gone.txt"), "x\ny\n");
  fs.writeFileSync(path.join(src, "same.txt"), "same\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "first"]);
  // No newline at the end: git prints "\ No newline at end of file".
  fs.writeFileSync(path.join(src, "a.txt"), "one\nTWO\nthree");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "second"]);
  second = git(src, ["rev-parse", "HEAD"]);
  const reposDir = path.join(root, "repos");
  const repoDir = path.join(reposDir, APP);
  git(root, ["clone", "--bare", "--quiet", src, path.join(repoDir, ".git")]);
  git(repoDir, ["--git-dir=.git", "worktree", "add", "-q", path.join(repoDir, "main"), "main"]);
  const wt = path.join(repoDir, "main");
  fs.writeFileSync(path.join(wt, "a.txt"), "zero\none\nTWO\nthree");
  fs.writeFileSync(path.join(wt, "new.txt"), "fresh\nfile\n");
  fs.rmSync(path.join(wt, "gone.txt"));
  // An ignored file: not uncommitted work.
  fs.mkdirSync(path.join(repoDir, ".git", "info"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, ".git", "info", "exclude"), "*.log\n");
  fs.writeFileSync(path.join(wt, "debug.log"), "noise\n");
  q = new GitQueries(localGitRunner(reposDir));
}, 20_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("GitQueries.getFileDiff", () => {
  it("is a file at a commit: the whole file with the removed lines spliced in", async () => {
    const d = await q.getFileDiff(APP, "a.txt", { hash: second });
    expect(d?.text).toBe("one\ntwo\nthree\nTWO\nthree");
    expect(d?.rows.map((r) => r.kind)).toEqual(["context", "removed", "removed", "added", "added"]);
  });

  it("is a worktree file's uncommitted change against HEAD", async () => {
    const d = await q.getFileDiff(APP, "a.txt", { worktree: "main" });
    expect(d?.text).toBe("zero\none\nTWO\nthree");
    expect(d?.rows.map((r) => r.kind)).toEqual(["added", "context", "context", "context"]);
  });

  it("is an untracked file as all added", async () => {
    const d = await q.getFileDiff(APP, "new.txt", { worktree: "main" });
    expect(d?.text).toBe("fresh\nfile");
    expect(d?.rows.map((r) => r.kind)).toEqual(["added", "added"]);
  });

  it("is a deleted file as all removed", async () => {
    const d = await q.getFileDiff(APP, "gone.txt", { worktree: "main" });
    expect(d?.text).toBe("x\ny");
    expect(d?.rows.map((r) => r.kind)).toEqual(["removed", "removed"]);
  });

  it("is an unchanged file as itself", async () => {
    const d = await q.getFileDiff(APP, "same.txt", { worktree: "main" });
    expect(d?.text).toBe("same");
    expect(d?.rows.map((r) => r.kind)).toEqual(["context"]);
  });

  it("is null for a file that is nowhere", async () => {
    expect(await q.getFileDiff(APP, "nope.txt", { worktree: "main" })).toBeNull();
    expect(await q.getFileDiff(APP, "nope.txt", { hash: second })).toBeNull();
  });
});

describe("GitQueries.getUncommittedFiles", () => {
  it("is a worktree's changed, deleted and untracked files, not its ignored ones", async () => {
    expect(await q.getUncommittedFiles(APP, "main")).toEqual([
      { filePath: "a.txt", added: 1, deleted: 0, status: "modified" },
      { filePath: "gone.txt", added: 0, deleted: 2, status: "deleted" },
      { filePath: "new.txt", added: 0, deleted: 0, status: "added" },
    ]);
  });
});
