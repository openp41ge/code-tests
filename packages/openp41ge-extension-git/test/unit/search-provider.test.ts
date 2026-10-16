/**
 * The git extension's palette search provider: the workspace's repositories
 * and their worktrees (opened as the Repository tab), and, for a query that
 * looks like a commit hash, the commit it names in each cloned repository
 * (opened as the Commit tab).
 */
import { describe, it, expect, vi } from "vitest";
import type { GitRequest, GitResult, HandlerContext, SearchItem } from "openp41ge-sdk";
import {
  COMMIT_OPEN_KIND,
  REPOSITORY_OPEN_KIND,
  gitSearchProvider,
} from "@openp41ge-extension-git/search-provider";

const APP = "github.com/acme/app";
const LIB = "github.com/acme/lib";

function ctx(git: (req: GitRequest) => Promise<GitResult>): HandlerContext {
  const wt = (repoName: string, branch: string) => ({ repoName, branch, path: `/r/${branch}` });
  return {
    extensionId: "openp41ge-extension-git",
    publish: () => undefined,
    git,
    config: { get: () => ({}) },
    workspace: {
      id: "ws",
      roots: async () => [],
      repositories: async () => [
        { repoName: APP, cloned: true, worktrees: [wt(APP, "main"), wt(APP, "feature/x")] },
        { repoName: LIB, cloned: false, worktrees: [] },
      ],
      addWorktree: async () => ({ ok: false }),
      dataDir: async () => "/d",
    },
    windowId: "w1",
    log: { debug() {}, info() {}, warn() {}, error() {} } as unknown as HandlerContext["log"],
  };
}

const noGit = vi.fn(async (): Promise<GitResult> => ({
  ok: false,
  exitCode: 1,
  stdout: "",
  stderr: "",
}));

const shown = (items: readonly SearchItem[]) => items.map((i) => [i.title, i.description]);

describe("git search provider", () => {
  it("offers every repository and its worktrees", async () => {
    const items = await gitSearchProvider.search("", ctx(noGit));
    expect(shown(items)).toEqual([
      ["app", APP],
      ["app · main", APP],
      ["app · feature/x", APP],
      ["lib", LIB],
    ]);
    expect(items[2]).toMatchObject({
      kind: REPOSITORY_OPEN_KIND,
      params: { repoName: APP, branch: "feature/x" },
    });
    expect(items[0]).toMatchObject({ kind: REPOSITORY_OPEN_KIND, params: { repoName: APP } });
    expect(noGit).not.toHaveBeenCalled();
  });

  it("keeps those whose name and branch have the query's letters in order", async () => {
    const items = await gitSearchProvider.search("featx", ctx(noGit));
    expect(shown(items)).toEqual([["app · feature/x", APP]]);
  });

  it("finds the commit a hash names in each cloned repository", async () => {
    const hash = "0123456789abcdef0123456789abcdef01234567";
    const git = vi.fn(async (req: GitRequest): Promise<GitResult> => {
      expect(req.repo).toBe(APP);
      expect(req.args).toContain("0123abc^{commit}");
      return { ok: true, exitCode: 0, stdout: `${hash}\x1f0123abc\x1fFix the thing\n`, stderr: "" };
    });
    const items = await gitSearchProvider.search("0123abc", ctx(git));
    const commit = items.find((i) => "kind" in i && i.kind === COMMIT_OPEN_KIND);
    expect(commit).toEqual({
      kind: COMMIT_OPEN_KIND,
      params: { repoName: APP, hash, shortHash: "0123abc" },
      title: "Fix the thing",
      description: `0123abc · ${APP}`,
      key: `${APP}@${hash}`,
    });
    expect(git).toHaveBeenCalledOnce();
  });

  it("skips a hash that names no commit", async () => {
    const items = await gitSearchProvider.search("deadbeef", ctx(noGit));
    expect(items.some((i) => "kind" in i && i.kind === COMMIT_OPEN_KIND)).toBe(false);
  });

  it("finds nothing without a workspace", async () => {
    expect(await gitSearchProvider.search("", { ...ctx(noGit), workspace: null })).toEqual([]);
  });
});
