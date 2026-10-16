/**
 * Behaviour tests for GitQueries' commit search (searchCommitWindow,
 * getMatchContext — what the History search runs) using a real local
 * git repo (bare clone under reposDir/<name>/.git), so the git commands and
 * the record-parsing are exercised end-to-end exactly as in production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { GitQueries } from "@openp41ge-sdk-git/git-queries";
import type { CommitSearchOptions, SearchResultCommit } from "@openp41ge-sdk-git/git-types";
import { localGitRunner } from "./local-git-runner";

function git(cwd: string, args: string[]): string {
  return execSync(`git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.co",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.co",
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  }).trim();
}

describe("GitQueries commit search", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: GitQueries;
  const repoName = "github.com/example/demo";

  /** Values set during the test setup — capture commit messages by index. */
  const shortHash: Record<string, string> = {};

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-search-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);

    fs.writeFileSync(path.join(srcRepo, "a.txt"), "hello world\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "initial commit"]);

    fs.writeFileSync(path.join(srcRepo, "a.txt"), "hello world again\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "add feature xyz alpha"]);

    fs.writeFileSync(path.join(srcRepo, "b.txt"), "sample content\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "add b.txt helper"]);

    // A commit whose MESSAGE does not mention the changed file path — used to
    // prove file-scope / all-scope match by path alone.
    fs.mkdirSync(path.join(srcRepo, "docs"), { recursive: true });
    fs.writeFileSync(path.join(srcRepo, "docs", "readme.md"), "# Demo\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "cleanup: remove cruft"]);

    // A commit whose BODY (not subject) contains the search token — used to
    // prove all-scope keeps git-native body matches that message-scope finds.
    fs.writeFileSync(path.join(srcRepo, "c.txt"), "widget\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "chore: install widget", "-m", "Fixes the thingamajig zorple"]);

    // Tag the commits for stable assertions (oldest → newest).
    const logs = git(srcRepo, ["log", "--oneline", "--reverse"]).split("\n").filter(Boolean);
    logs.forEach((line, i) => {
      const h = line.split(" ")[0];
      shortHash[`c${i}`] = h;
    });

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);

    svc = new GitQueries(localGitRunner(reposDir));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Search the whole (5-commit) history as one window. */
  const search = async (options: CommitSearchOptions, start = 0, size = 50) =>
    (await svc.searchCommitWindow(repoName, options, start, size)).commits;
  const hashesOf = (commits: SearchResultCommit[]) => commits.map((c) => c.shortHash);

  it("message scope matches the commit message (case-insensitive, --grep)", async () => {
    const results = await search({ query: "xyz alpha", in: "message" });
    expect(hashesOf(results)).toEqual([shortHash.c1]);
    expect(results[0].message).toContain("xyz alpha");
    expect(results[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "a.txt" })]),
    );
    expect(hashesOf(await search({ query: "XYZ ALPHA", in: "message" }))).toEqual([shortHash.c1]);
  });

  it("caseSensitive true excludes case-mismatched message matches", async () => {
    // The fixture message is lowercase "add feature xyz alpha".
    expect(await search({ query: "XYZ ALPHA", in: "message", caseSensitive: true })).toEqual([]);
  });

  it("regex option toggles regex vs literal matching", async () => {
    // "xyz*" never appears literally, but as a regex (xy + zero-or-more z) it
    // matches "add feature xyz alpha" (c1).
    expect(await search({ query: "xyz*", in: "message" })).toEqual([]);
    expect(hashesOf(await search({ query: "xyz*", in: "message", regex: true }))).toEqual([
      shortHash.c1,
    ]);
    expect(
      hashesOf(await search({ query: "xyz*", in: "message", regex: true, caseSensitive: true })),
    ).toEqual([shortHash.c1]);
  });

  it("searches one window of the newest-first history, saying how much it walked", async () => {
    // History, newest first: c4 c3 c2 c1 c0. "add" is in c1 and c2's subjects.
    const first = await svc.searchCommitWindow(repoName, { query: "add", in: "message" }, 0, 2);
    expect(first).toEqual({ commits: [], walked: 2 });
    const second = await svc.searchCommitWindow(repoName, { query: "add", in: "message" }, 2, 2);
    expect(hashesOf(second.commits)).toEqual([shortHash.c2, shortHash.c1]);
    expect(second.walked).toBe(2);
    // The last window is short: the history ends.
    const last = await svc.searchCommitWindow(repoName, { query: "add", in: "message" }, 4, 2);
    expect(last.walked).toBe(1);
  });

  it("a window searches only its own commits", async () => {
    // c1 is the 4th newest: outside a window of the newest one.
    expect(await search({ query: "xyz alpha", in: "message" }, 0, 1)).toEqual([]);
  });

  it("files scope matches changed-file paths", async () => {
    const results = await search({ query: "b.txt", in: "files" });
    expect(hashesOf(results)).toEqual([shortHash.c2]);
    expect(results[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "b.txt", additions: 1 })]),
    );
  });

  it("files scope finds a commit by path even when the message never mentions it", async () => {
    const results = await search({ query: "readme", in: "files" });
    expect(hashesOf(results)).toEqual([shortHash.c3]);
    expect(results[0].message).toBe("cleanup: remove cruft");
  });

  it("all scope matches message OR changed-file path", async () => {
    expect(hashesOf(await search({ query: "xyz", in: "all" }))).toEqual([shortHash.c1]);
    // A query matching only a file path (not any message) still hits via all.
    expect(hashesOf(await search({ query: "readme", in: "all" }))).toEqual([shortHash.c3]);
  });

  it("all scope returns body-only message matches (superset of message scope, never fewer)", async () => {
    // "zorple" appears only in the commit BODY; --grep matches subject + body.
    expect(hashesOf(await search({ query: "zorple", in: "message" }))).toEqual([shortHash.c4]);
    expect(hashesOf(await search({ query: "zorple", in: "all" }))).toEqual([shortHash.c4]);
  });

  it("leaves match lines to getMatchContext", async () => {
    const [r] = await search({ query: "zorple", in: "message" });
    expect(r.matched).toBeUndefined();
  });

  it("finds where a commit matched, on demand", async () => {
    const opts = { regex: false, caseSensitive: false, content: true };
    expect(await svc.getMatchContext(repoName, shortHash.c4, "zorple", opts)).toEqual({
      text: "Fixes the thingamajig zorple",
      in: "body",
    });
    expect(await svc.getMatchContext(repoName, shortHash.c2, "SAMPLE", opts)).toEqual({
      text: "sample content",
      in: "line",
      path: "b.txt",
    });
    expect(await svc.getMatchContext(repoName, shortHash.c2, "nowhere", opts)).toBeNull();
    // Without content, a changed line is not looked at.
    expect(
      await svc.getMatchContext(repoName, shortHash.c2, "sample", { ...opts, content: false }),
    ).toBeNull();
  });

  it("names the worktree branch a result belongs to (of those given)", async () => {
    const bare = path.join(reposDir, repoName, ".git");
    git(reposDir, [`--git-dir=${bare}`, "branch", "-f", "old", shortHash.c0]);
    const [onMain] = await search({
      query: "xyz alpha",
      in: "message",
      worktrees: ["main", "old"],
    });
    expect(onMain.worktree).toBe("main");
    const [notOnOld] = await search({ query: "xyz alpha", in: "message", worktrees: ["old"] });
    expect(notOnOld.worktree).toBeUndefined();
    const [none] = await search({ query: "xyz alpha", in: "message" });
    expect(none.worktree).toBeUndefined();
  });

  it("an empty query matches nothing, but still walks the window", async () => {
    expect(await svc.searchCommitWindow(repoName, { query: "   ", in: "message" }, 0, 50)).toEqual({
      commits: [],
      walked: 5,
    });
  });

  it("a garbage query returns no results", async () => {
    expect(await search({ query: "zzz-no-such-token-zzz", in: "all" })).toEqual([]);
  });

  it("throws for an unknown repo", async () => {
    await expect(
      svc.searchCommitWindow("github.com/example/missing", { query: "abc", in: "message" }, 0, 5),
    ).rejects.toThrow();
  });

  // ── Content dimension (git -G pickaxe) ────────────────────────────────

  it("content on finds commits by their changed LINES even when no message matches", async () => {
    // "sample" appears only in b.txt's changed lines (c2), never in a message.
    expect(await search({ query: "sample", in: "message" })).toEqual([]);
    const withContent = await search({ query: "sample", in: "message", content: true });
    expect(hashesOf(withContent)).toEqual([shortHash.c2]);
    expect(withContent[0].files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "b.txt" })]),
    );
  });

  it("content pass unions by hash and never drops message-only hits", async () => {
    // "hello" is in no message, only in c0's and c1's changed lines.
    expect(await search({ query: "hello", in: "message" })).toEqual([]);
    expect(hashesOf(await search({ query: "hello", in: "message", content: true }))).toEqual([
      shortHash.c1,
      shortHash.c0,
    ]);
    // "xyz alpha" matches c1's message, and content does not add it twice.
    expect(hashesOf(await search({ query: "xyz alpha", in: "message", content: true }))).toEqual([
      shortHash.c1,
    ]);
  });

  it("content with in:files/all keeps file-path hits alongside line hits", async () => {
    expect(hashesOf(await search({ query: "readme", in: "all", content: true }))).toEqual([
      shortHash.c3,
    ]);
    expect(hashesOf(await search({ query: "readme", in: "files", content: true }))).toEqual([
      shortHash.c3,
    ]);
  });

  it("content is case-insensitive unless caseSensitive is set", async () => {
    expect(hashesOf(await search({ query: "SAMPLE", in: "message", content: true }))).toEqual([
      shortHash.c2,
    ]);
    expect(
      await search({ query: "SAMPLE", in: "message", content: true, caseSensitive: true }),
    ).toEqual([]);
  });

  it("literal content queries are regex-escaped; regex mode passes the pattern through", async () => {
    // As a literal the dot is escaped → "sample content" is not hit by
    // "sample.". As a regex "sample." means "sample" + any char → matches.
    expect(await search({ query: "sample.", in: "message", content: true })).toEqual([]);
    expect(
      hashesOf(await search({ query: "sample.", in: "message", content: true, regex: true })),
    ).toEqual([shortHash.c2]);
  });

  it("a failing -G content pass is swallowed and message results survive", async () => {
    // Only the content `-G` invocation fails; the message `--grep` still finds
    // zorple in c4's body.
    const queries = svc as unknown as {
      _execGit: (args: string[], repo?: string) => Promise<string>;
    };
    const real = queries._execGit.bind(svc);
    queries._execGit = (args, repo) =>
      args.some((a) => a.startsWith("-G")) ? Promise.reject(new Error("boom")) : real(args, repo);
    try {
      expect(hashesOf(await search({ query: "zorple", in: "message", content: true }))).toEqual([
        shortHash.c4,
      ]);
    } finally {
      queries._execGit = real;
    }
  });

  it("content matches only the window's commits", async () => {
    // "hello" is in c0's and c1's changed lines; the newest four reach c1, not c0.
    expect(await search({ query: "hello", in: "message", content: true }, 0, 1)).toEqual([]);
    expect(hashesOf(await search({ query: "hello", in: "message", content: true }, 0, 4))).toEqual([
      shortHash.c1,
    ]);
  });
});

describe("GitQueries.getCommitFileHunks", () => {
  let root: string;
  let srcRepo: string;
  let reposDir: string;
  let svc: GitQueries;
  const repoName = "github.com/example/hunks";
  let c0: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-hunks-test-"));
    srcRepo = path.join(root, "src");
    fs.mkdirSync(srcRepo, { recursive: true });
    git(srcRepo, ["init", "-q", "-b", "main", "."]);

    fs.writeFileSync(path.join(srcRepo, "app.txt"), "line one\nline two\nhello world\n");
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "add app.txt with hello"]);
    c0 = git(srcRepo, ["rev-parse", "HEAD"]);

    // Second commit edits app.txt — keeps a hunk with a removal and an add.
    fs.writeFileSync(
      path.join(srcRepo, "app.txt"),
      "line one\nline two\nhello brave world\nline four\n",
    );
    git(srcRepo, ["add", "."]);
    git(srcRepo, ["commit", "-qm", "expand app.txt"]);

    reposDir = path.join(root, "repos");
    fs.mkdirSync(reposDir, { recursive: true });
    git(reposDir, ["clone", "--bare", "--quiet", srcRepo, path.join(reposDir, repoName, ".git")]);
    svc = new GitQueries(localGitRunner(reposDir));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns ALL hunks for an empty query (commit-file diff viewer contract)", async () => {
    const c1 = git(srcRepo, ["rev-parse", "HEAD"]);
    const all = await svc.getCommitFileHunks(repoName, c1, "app.txt", "  ", {});
    expect(all.length).toBeGreaterThan(0);
    // Includes both the removed "hello world" line and the added "hello
    // brave world" line (a query would filter them, empty keeps everything).
    const texts = all.flatMap((h) => h.lines.map((l) => ({ t: l.type, x: l.text })));
    expect(texts).toContainEqual({ t: "-", x: "hello world" });
    expect(texts).toContainEqual({
      t: "+",
      x: "hello brave world",
    });
  });

  it("returns [] for an unknown hash or file", async () => {
    await expect(svc.getCommitFileHunks(repoName, c0, "nope.ts", "hello", {})).resolves.toEqual([]);
    await expect(
      svc.getCommitFileHunks(repoName, "deadbeef", "app.txt", "hello", {}),
    ).resolves.toEqual([]);
  });

  it("parses hunks and filters to those whose lines contain the query", async () => {
    const c1 = git(srcRepo, ["rev-parse", "HEAD"]);
    const hunks = await svc.getCommitFileHunks(repoName, c1, "app.txt", "brave", {});
    expect(hunks.length).toBeGreaterThan(0);
    // Every returned hunk has a line mentioning the token.
    for (const h of hunks) {
      expect(h.header).toMatch(/^@@/);
      expect(h.lines.some((l) => l.text.includes("brave"))).toBe(true);
    }
    const minus = hunks.flatMap((h) => h.lines).filter((l) => l.type === "-");
    expect(minus.map((l) => l.text)).toContain("hello world");
  });

  it("honours query/caseSensitive/regex match rules", async () => {
    const c1 = git(srcRepo, ["rev-parse", "HEAD"]);
    // The added line is "hello brave world" (lowercase b).
    const csMismatch = await svc.getCommitFileHunks(repoName, c1, "app.txt", "BRAVE", {
      caseSensitive: true,
    });
    expect(csMismatch).toEqual([]);
    const ci = await svc.getCommitFileHunks(repoName, c1, "app.txt", "BRAVE", {});
    expect(ci.length).toBeGreaterThan(0);

    // Regex: "world" alternation matches the added line; literal "world"
    // also matches it, so use a token that regex-only matches.
    const regexOnly = await svc.getCommitFileHunks(repoName, c1, "app.txt", "br.ve", {
      regex: true,
    });
    expect(regexOnly.length).toBeGreaterThan(0);
    const literalDot = await svc.getCommitFileHunks(repoName, c1, "app.txt", "br.ve", {});
    expect(literalDot).toEqual([]);
  });

  it("missing repo is tolerated with []", async () => {
    await expect(
      svc.getCommitFileHunks("github.com/example/missing", c0, "app.txt", "hello", {}),
    ).resolves.toEqual([]);
  });

  it("getCommitFileContent returns the file at that revision, null when unknown", async () => {
    const c0Content = await svc.getCommitFileContent(repoName, c0, "app.txt");
    expect(c0Content).toContain("hello world");

    const c1 = git(srcRepo, ["rev-parse", "HEAD"]);
    const c1Content = await svc.getCommitFileContent(repoName, c1, "app.txt");
    expect(c1Content).toContain("hello brave world");
    expect(c1Content).toContain("line four"); // second commit added a 4th line

    // Unknown hash / file → null (not a throw).
    await expect(svc.getCommitFileContent(repoName, "deadbeef", "app.txt")).resolves.toBeNull();
    await expect(svc.getCommitFileContent(repoName, c1, "nope.ts")).resolves.toBeNull();
  });
});
