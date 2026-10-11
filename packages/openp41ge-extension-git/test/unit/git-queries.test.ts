/**
 * GitQueries on a real repository: commit log, branches, diff stats (a
 * commit's, and a worktree's uncommitted changes), untracked files, deleting
 * a branch.
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
let reposDir: string;
let q: GitQueries;
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "git-queries-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "a\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "first"]);
  fs.writeFileSync(path.join(src, "b.txt"), "b\n");
  fs.writeFileSync(path.join(src, "a.txt"), "a2\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "second", "-m", "body text"]);
  git(src, ["branch", "feature"]);
  reposDir = path.join(root, "repos");
  const repoDir = path.join(reposDir, APP);
  git(root, ["clone", "--bare", "--quiet", src, path.join(repoDir, ".git")]);
  git(repoDir, ["--git-dir=.git", "fetch", "-q", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  git(repoDir, ["--git-dir=.git", "worktree", "add", "-q", path.join(repoDir, "main"), "main"]);
  // Uncommitted work in the main worktree: a change, a new file, an ignored one.
  fs.writeFileSync(path.join(repoDir, "main", "a.txt"), "a3\nmore\n");
  fs.writeFileSync(path.join(repoDir, "main", "new.txt"), "new\n");
  q = new GitQueries(localGitRunner(reposDir));
}, 20_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("GitQueries", () => {
  it("lists a branch's commits, newest first, with message and body", async () => {
    const log = await q.getCommitLog(APP, "main");
    expect(log.map((c) => c.message)).toEqual(["second", "first"]);
    expect(log[0]).toMatchObject({ authorName: "t", fullMessage: "second\n\nbody text" });
    expect(log[1].fullMessage).toBe("first");
    expect(log[0].parents).toEqual([log[1].hash]);
  });

  it("lists local and remote branches", async () => {
    const branches = await q.getBranches(APP);
    const names = branches.map((b) => `${b.isLocal ? "local" : "remote"}:${b.name}`);
    expect(names).toEqual(
      expect.arrayContaining(["local:main", "local:feature", "remote:origin/main"]),
    );
    expect(branches.find((b) => b.name === "main")?.lastCommit?.message).toBe("second");
  });

  it("gives a commit's diff stat with each file's status", async () => {
    const [second] = await q.getCommitLog(APP, "main", { maxCount: 1 });
    const stat = await q.getDiffStat(APP, second.hash);
    expect(stat.map((s) => [s.filePath, s.status, s.added, s.deleted]).sort()).toEqual([
      ["a.txt", "modified", 1, 1],
      ["b.txt", "added", 1, 0],
    ]);
  });

  it("gives a worktree's uncommitted changes, and its untracked files", async () => {
    const stat = await q.getDiffStat(APP, undefined, "main");
    expect(stat).toEqual([{ filePath: "a.txt", added: 2, deleted: 1, status: "modified" }]);
    expect(await q.getUntrackedFiles(APP, "main")).toEqual(["new.txt"]);
  });

  it("deletes a branch", async () => {
    await q.deleteLocalBranch(APP, "feature");
    expect((await q.getBranches(APP)).some((b) => b.isLocal && b.name === "feature")).toBe(false);
  });

  it("keeps a subject containing | whole", async () => {
    const repoDir = path.join(reposDir, APP);
    fs.writeFileSync(path.join(repoDir, "main", "pipe.txt"), "x\n");
    git(path.join(repoDir, "main"), ["add", "pipe.txt"]);
    git(path.join(repoDir, "main"), ["commit", "-qm", "a | b subject", "-m", "a | b body"]);
    const [latest] = await q.getCommitLog(APP, "main", { maxCount: 1 });
    expect(latest.message).toBe("a | b subject");
    expect(latest.fullMessage).toBe("a | b subject\n\na | b body");
  });
});
