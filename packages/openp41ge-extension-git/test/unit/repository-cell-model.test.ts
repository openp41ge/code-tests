/**
 * The repository cell's model: what it loads, what is selected, and what the
 * Files changed section shows — with a fake git API (no DOM, no git).
 */
import { describe, it, expect, vi } from "vitest";
import type { RepositoryState } from "openp41ge-sdk";
import {
  RepositoryCellModel,
  filesSection,
  type RepositoryCellApi,
} from "@openp41ge-extension-git/repository-cell-model";
import type { BranchEntry, CommitEntry, DiffStatEntry } from "openp41ge-sdk-git";

const REPO = "github.com/acme/app";

const commit = (n: number): CommitEntry => ({
  hash: `h${n}`,
  shortHash: `s${n}`,
  authorName: "a",
  authorEmail: "a@a",
  date: "",
  relativeDate: "now",
  message: `m${n}`,
  fullMessage: `m${n}`,
  refs: [],
  parents: [],
});
const branch = (name: string, isLocal = true): BranchEntry => ({
  name,
  shortName: name.replace(/^origin\//, ""),
  isLocal,
  isCurrent: false,
  ahead: 0,
  behind: 0,
  lastCommit: null,
});
const file = (filePath: string): DiffStatEntry => ({
  filePath,
  added: 1,
  deleted: 0,
  status: "modified",
});
const repoState = (
  branches: Array<{ branch: string; worktree: boolean; unstaged?: number }>,
): RepositoryState => ({
  repoName: REPO,
  branches: branches.map((b) => ({
    branch: b.branch,
    worktree: b.worktree,
    staged: 0,
    unstaged: b.unstaged ?? 0,
    untracked: 0,
    unpushed: 0,
  })),
});

function fakeApi(over: Partial<RepositoryCellApi> = {}): RepositoryCellApi {
  return {
    fetch: vi.fn(async () => undefined),
    branches: vi.fn(async () => [branch("main"), branch("dev"), branch("origin/main", false)]),
    commitLog: vi.fn(async (_b: string, o: { maxCount: number; skip: number }) =>
      Array.from({ length: Math.min(o.maxCount, 60 - o.skip) }, (_, i) => commit(o.skip + i)),
    ),
    diffStat: vi.fn(async (hash: string) => [file(`${hash}.ts`)]),
    uncommittedFiles: vi.fn(async () => [file("wip.ts")]),
    ...over,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function started(
  api: RepositoryCellApi,
  params: { repoName: string; branch?: string },
  state?: RepositoryState,
): Promise<RepositoryCellModel> {
  const m = new RepositoryCellModel(api, params, () => undefined);
  m.setContext({ cloned: true, ...(state ? { repositoryState: state } : {}) });
  m.start();
  await settle();
  await settle();
  return m;
}

describe("RepositoryCellModel — a repository", () => {
  it("fetches, then loads the branches and the first branch's commits", async () => {
    const api = fakeApi();
    const m = await started(api, { repoName: REPO });
    expect(api.fetch).toHaveBeenCalled();
    expect(m.state.branches.map((b) => b.name)).toEqual(["main", "dev", "origin/main"]);
    expect(m.state.selectedBranch).toBe("main");
    expect(m.state.commits).toHaveLength(50);
    expect(m.state.visibleCommitCount).toBe(10);
    expect(m.state.loadingBranches || m.state.loadingCommits).toBe(false);
  });

  it("shows the uncommitted entry, selected, for a branch whose worktree has changes", async () => {
    const api = fakeApi();
    const m = await started(
      api,
      { repoName: REPO },
      repoState([{ branch: "main", worktree: true, unstaged: 1 }]),
    );
    expect(api.uncommittedFiles).toHaveBeenCalledWith("main");
    expect(m.state.selection).toEqual({ kind: "uncommitted" });
    expect(filesSection(m.state)).toMatchObject({ files: [file("wip.ts")] });
  });

  it("explains a branch without a worktree has no uncommitted changes", async () => {
    const m = await started(
      fakeApi(),
      { repoName: REPO },
      repoState([
        { branch: "main", worktree: true },
        { branch: "dev", worktree: false },
      ]),
    );
    m.selectBranch("dev");
    await settle();
    expect(m.state.selection).toEqual({ kind: "none" });
    expect(filesSection(m.state).message).toMatch(/dev is not checked out as a worktree/);
    m.selectBranch("origin/main");
    await settle();
    expect(filesSection(m.state).message).toMatch(/not checked out as a worktree/);
  });

  it("explains nothing about worktrees before the repository's state is known", async () => {
    const m = await started(fakeApi(), { repoName: REPO });
    expect(filesSection(m.state).message).toBe("Select a commit to view its changes");
  });

  it("lists a selected commit's files, and deselects on a second click", async () => {
    const api = fakeApi();
    const m = await started(api, { repoName: REPO }, repoState([]));
    m.selectCommit("h3");
    await settle();
    expect(api.diffStat).toHaveBeenCalledWith("h3");
    expect(filesSection(m.state).files).toEqual([file("h3.ts")]);
    m.selectCommit("h3");
    expect(m.state.selection).toEqual({ kind: "none" });
  });

  it("shows more commits from those loaded, then loads the next page", async () => {
    const api = fakeApi();
    const m = await started(api, { repoName: REPO });
    for (let i = 0; i < 4; i++) m.showMore();
    expect(m.state.visibleCommitCount).toBe(50);
    expect(m.state.hasMoreCommits).toBe(true);
    m.showMore();
    await settle();
    expect(api.commitLog).toHaveBeenLastCalledWith("main", { maxCount: 50, skip: 50 });
    expect(m.state.commits).toHaveLength(60);
    expect(m.state.hasMoreCommits).toBe(false);
    expect(m.state.visibleCommitCount).toBe(60);
  });

  it("says when the repository is not cloned, and runs no git", async () => {
    const api = fakeApi();
    const m = new RepositoryCellModel(api, { repoName: REPO }, () => undefined);
    m.setContext({ cloned: false });
    m.start();
    await settle();
    expect(m.state.error).toMatch(/not cloned in this workspace/);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(api.branches).not.toHaveBeenCalled();
  });

  it("shows a branch list failure as the cell's error", async () => {
    const m = await started(
      fakeApi({
        branches: vi.fn(async () => {
          throw new Error("fatal: bad object");
        }),
      }),
      { repoName: REPO },
    );
    expect(m.state.error).toBe("fatal: bad object");
  });
});

describe("RepositoryCellModel — a worktree", () => {
  it("loads only its branch's commits (no branches)", async () => {
    const api = fakeApi();
    const m = await started(api, { repoName: REPO, branch: "dev" });
    expect(api.branches).not.toHaveBeenCalled();
    expect(api.commitLog).toHaveBeenCalledWith("dev", { maxCount: 50, skip: 0 });
    expect(m.state.selectedBranch).toBe("dev");
  });

  it("follows the worktree's changes as they come and go", async () => {
    const uncommitted = vi.fn(async () => [file("wip.ts")]);
    const api = fakeApi({ uncommittedFiles: uncommitted });
    const m = await started(
      api,
      { repoName: REPO, branch: "dev" },
      repoState([{ branch: "dev", worktree: true, unstaged: 1 }]),
    );
    expect(m.state.selection).toEqual({ kind: "uncommitted" });

    // Committed: the state changes, the changes are gone.
    uncommitted.mockResolvedValue([]);
    m.setContext({ cloned: true, repositoryState: repoState([{ branch: "dev", worktree: true }]) });
    await settle();
    await settle();
    expect(m.state.uncommitted).toEqual([]);
    expect(m.state.selection).toEqual({ kind: "none" });
    expect(api.commitLog).toHaveBeenCalledTimes(2); // the new commit shows too

    // New changes, nothing else selected: the entry is selected again.
    uncommitted.mockResolvedValue([file("next.ts")]);
    m.setContext({
      cloned: true,
      repositoryState: repoState([{ branch: "dev", worktree: true, unstaged: 1 }]),
    });
    await settle();
    await settle();
    expect(m.state.selection).toEqual({ kind: "uncommitted" });
  });

  it("does not take the selection from a commit the user picked", async () => {
    const m = await started(
      fakeApi(),
      { repoName: REPO, branch: "dev" },
      repoState([{ branch: "dev", worktree: true, unstaged: 1 }]),
    );
    m.selectCommit("h1");
    m.setContext({
      cloned: true,
      repositoryState: repoState([{ branch: "dev", worktree: true, unstaged: 2 }]),
    });
    await settle();
    await settle();
    expect(m.state.selection).toEqual({ kind: "commit", hash: "h1" });
  });
});

describe("RepositoryCellModel.fileDiffParams", () => {
  it("opens a commit's file at the commit, an uncommitted one in the worktree", async () => {
    const m = await started(
      fakeApi(),
      { repoName: REPO, branch: "dev" },
      repoState([{ branch: "dev", worktree: true, unstaged: 1 }]),
    );
    expect(m.fileDiffParams("wip.ts")).toEqual({ repoName: REPO, path: "wip.ts", branch: "dev" });
    m.selectCommit("h2");
    expect(m.fileDiffParams("old.ts => new.ts")).toEqual({
      repoName: REPO,
      path: "new.ts",
      hash: "h2",
    });
  });
});
