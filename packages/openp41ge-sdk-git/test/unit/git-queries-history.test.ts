/**
 * GitQueries' history queries (what the agents' git tools read), on a real
 * repository, without touching the network: commits filtered by ref, path,
 * author, date and message or code search; a commit's or a range's patch; a
 * worktree's staged and unstaged changes; blame of a line range; local
 * branches with their upstream and ahead/behind. A ref or path that starts
 * with `-` is refused before git runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { GitQueries } from "@openp41ge-sdk-git/git-queries";
import { localGitRunner } from "./local-git-runner";

const APP = "github.com/acme/app";
let root: string;
let q: GitQueries;
let ran: string[][];

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "git-history-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  git(src, ["init", "-q", "-b", "main", "."]);
  fs.writeFileSync(path.join(src, "a.txt"), "one\ntwo\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "Add a"], "ann", "2026-01-01T10:00:00Z");
  fs.writeFileSync(path.join(src, "b.txt"), "const answer = 42;\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "Add the answer", "-m", "Why: tests"], "bob", "2026-02-01T10:00:00Z");
  fs.writeFileSync(path.join(src, "a.txt"), "one\nTWO\nthree\n");
  git(src, ["add", "."]);
  git(src, ["commit", "-qm", "Change a"], "ann", "2026-03-01T10:00:00Z");
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
  // An unpushed commit, then uncommitted work: one staged, one not, one untracked.
  const wt = path.join(repoDir, "main");
  fs.writeFileSync(path.join(wt, "c.txt"), "c\n");
  git(wt, ["add", "c.txt"]);
  git(wt, ["commit", "-qm", "Local only"], "ann", "2026-04-01T10:00:00Z");
  fs.writeFileSync(path.join(wt, "b.txt"), "const answer = 43;\n");
  git(wt, ["add", "b.txt"]);
  fs.writeFileSync(path.join(wt, "a.txt"), "one\nTWO\nthree\nfour\n");
  fs.writeFileSync(path.join(wt, "new.txt"), "new\n");
  const local = localGitRunner(reposDir);
  ran = [];
  q = new GitQueries((repo, args, worktree, ok) => {
    ran.push(args);
    return local(repo, args, worktree, ok);
  });
}, 20_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const subjects = (commits: { message: string }[]) => commits.map((c) => c.message);

describe("findCommits", () => {
  it("lists HEAD's history, newest first", async () => {
    expect(subjects(await q.findCommits(APP, {}))).toEqual([
      "Local only",
      "Change a",
      "Add the answer",
      "Add a",
    ]);
  });

  it("filters by ref, path, author and dates", async () => {
    expect(subjects(await q.findCommits(APP, { ref: "origin/main" }))).toEqual([
      "Change a",
      "Add the answer",
      "Add a",
    ]);
    expect(subjects(await q.findCommits(APP, { path: "a.txt" }))).toEqual(["Change a", "Add a"]);
    expect(subjects(await q.findCommits(APP, { author: "bob" }))).toEqual(["Add the answer"]);
    expect(
      subjects(await q.findCommits(APP, { since: "2026-01-15", until: "2026-03-15" })),
    ).toEqual(["Change a", "Add the answer"]);
  });

  it("searches messages, and code added or removed", async () => {
    expect(
      subjects(await q.findCommits(APP, { search: "why: tests", searchIn: "message" })),
    ).toEqual(["Add the answer"]);
    expect(subjects(await q.findCommits(APP, { search: "answer = 42", searchIn: "code" }))).toEqual(
      ["Add the answer"],
    );
    expect(subjects(await q.findCommits(APP, { search: "^TW.$", searchIn: "code_regex" }))).toEqual(
      ["Change a"],
    );
  });

  it("pages with a limit and a skip", async () => {
    expect(subjects(await q.findCommits(APP, { maxCount: 2, skip: 1 }))).toEqual([
      "Change a",
      "Add the answer",
    ]);
  });

  it("never fetches", async () => {
    await expect(q.findCommits(APP, { ref: "origin/nope" })).rejects.toThrow();
    expect(ran.some((args) => args[0] === "fetch" || args[0] === "ls-remote")).toBe(false);
  });
});

describe("getPatch", () => {
  it("is a commit's patch, or one file's of it", async () => {
    const [change] = await q.findCommits(APP, { search: "Change a", searchIn: "message" });
    const patch = await q.getPatch(APP, { commit: change.hash });
    expect(patch).toContain("+TWO");
    expect(patch).toContain("-two");
    expect(await q.getPatch(APP, { commit: change.hash, path: "b.txt" })).toBe("");
  });

  it("is a range's patch, or just its files", async () => {
    expect(await q.getPatch(APP, { from: "origin/main", to: "main" })).toContain("+c");
    expect(await q.getPatch(APP, { from: "origin/main", to: "main", namesOnly: true })).toBe(
      "A\tc.txt",
    );
  });

  it("is a worktree's unstaged or staged changes", async () => {
    const unstaged = await q.getPatch(APP, { worktree: "main" });
    expect(unstaged).toContain("+four");
    expect(unstaged).not.toContain("answer");
    const staged = await q.getPatch(APP, { worktree: "main", staged: true });
    expect(staged).toContain("+const answer = 43;");
    expect(staged).not.toContain("four");
  });
});

describe("getBlame", () => {
  it("names the commit and author of each line in the range", async () => {
    const lines = await q.getBlame(APP, "a.txt", { ref: "main", start: 1, end: 3 });
    expect(lines.map((l) => [l.line, l.author, l.text])).toEqual([
      [1, "ann", "one"],
      [2, "ann", "TWO"],
      [3, "ann", "three"],
    ]);
    const [change] = await q.findCommits(APP, { search: "Change a", searchIn: "message" });
    expect(lines[1].hash).toBe(change.hash);
    expect(lines[0].summary).toBe("Add a");
  });

  it("blames the worktree's file, uncommitted lines included", async () => {
    const lines = await q.getBlame(APP, "a.txt", { worktree: "main", start: 4, end: 4 });
    expect(lines).toEqual([expect.objectContaining({ line: 4, text: "four", uncommitted: true })]);
  });
});

describe("getLocalBranches", () => {
  it("lists local branches with upstream, ahead/behind and last commit, without the network", async () => {
    ran.length = 0;
    const [main] = await q.getLocalBranches(APP);
    expect(main).toMatchObject({ name: "main", upstream: "origin/main", ahead: 1, behind: 0 });
    expect(main.lastCommit).toMatchObject({ message: "Local only" });
    expect(ran.some((args) => args[0] === "fetch" || args[0] === "ls-remote")).toBe(false);
  });
});

describe("getRemoteBranches", () => {
  it("lists the remote-tracking branches, without origin/HEAD", async () => {
    expect(await q.getRemoteBranches(APP)).toEqual(["origin/main"]);
  });
});

describe("unsafe values", () => {
  it("refuses a ref or path that starts with '-' before running git", async () => {
    ran.length = 0;
    await expect(q.findCommits(APP, { ref: "--output=/tmp/x" })).rejects.toThrow(/not a ref/);
    await expect(q.getPatch(APP, { commit: "-p" })).rejects.toThrow(/not a ref/);
    await expect(q.getBlame(APP, "-x", { start: 1, end: 1 })).rejects.toThrow(/not a path/);
    expect(ran).toEqual([]);
  });
});
