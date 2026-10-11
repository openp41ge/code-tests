/**
 * The commit cell's model: the commit and its changed files, loaded through
 * a fake API, and what a file row opens.
 */
import { describe, it, expect, vi } from "vitest";
import { CommitCellModel, type CommitCellApi } from "@openp41ge-extension-git/commit-cell-model";
import type { CommitEntry, DiffStatEntry } from "@openp41ge-extension-git/git-types";

const REPO = "github.com/acme/app";
const entry: CommitEntry = {
  hash: "abcdef1234",
  shortHash: "abcdef1",
  authorName: "a",
  authorEmail: "a@a",
  date: "2026-10-10T10:00:00Z",
  relativeDate: "now",
  message: "subject",
  fullMessage: "subject\n\nbody",
  refs: ["tag: v1"],
  parents: ["p1"],
};
const files: DiffStatEntry[] = [{ filePath: "a.ts", added: 1, deleted: 0, status: "modified" }];

const settle = () => new Promise((r) => setTimeout(r, 0));

function model(api: Partial<CommitCellApi> = {}) {
  const full: CommitCellApi = {
    commit: vi.fn(async () => entry),
    diffStat: vi.fn(async () => files),
    ...api,
  };
  return {
    api: full,
    m: new CommitCellModel(full, { repoName: REPO, hash: "abcdef1234" }, () => {}),
  };
}

describe("CommitCellModel", () => {
  it("loads the commit and its files", async () => {
    const { api, m } = model();
    expect(m.state.loading).toBe(true);
    m.start();
    await settle();
    expect(api.commit).toHaveBeenCalledWith("abcdef1234");
    expect(api.diffStat).toHaveBeenCalledWith("abcdef1234");
    expect(m.state).toMatchObject({ loading: false, commit: entry, files });
  });

  it("says when there is no such commit", async () => {
    const { m } = model({ commit: vi.fn(async () => null) });
    m.start();
    await settle();
    expect(m.state.error).toMatch(/not found/);
  });

  it("shows git's error", async () => {
    const { m } = model({
      commit: vi.fn(async () => {
        throw new Error("github.com/acme/app is not a repository of this workspace");
      }),
    });
    m.start();
    await settle();
    expect(m.state.error).toMatch(/not a repository/);
  });

  it("opens a file at the commit (a rename's new path)", () => {
    const { m } = model();
    expect(m.fileDiffParams("src/{old => new}.ts")).toEqual({
      repoName: REPO,
      path: "src/new.ts",
      hash: "abcdef1234",
    });
  });

  it("loads again on refresh", async () => {
    const { api, m } = model();
    m.start();
    await settle();
    m.refresh();
    await settle();
    expect(api.commit).toHaveBeenCalledTimes(2);
  });
});
