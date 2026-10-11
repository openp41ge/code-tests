/**
 * The File diff tab's params: what they ask the backend, and how the tab is
 * labelled.
 */
import { describe, it, expect } from "vitest";
import { fileDiffRequest, fileDiffTabLabel } from "@openp41ge-extension-git/file-diff-view";

describe("fileDiffRequest", () => {
  it("asks for a commit's change, or a worktree file's", () => {
    expect(fileDiffRequest({ repoName: "github.com/a/b", path: "x.ts", hash: "abc" })).toEqual({
      repo: "github.com/a/b",
      path: "x.ts",
      hash: "abc",
    });
    expect(fileDiffRequest({ repoName: "github.com/a/b", path: "x.ts", branch: "dev" })).toEqual({
      repo: "github.com/a/b",
      path: "x.ts",
      worktree: "dev",
    });
  });

  it("asks nothing without a repo and a path", () => {
    expect(fileDiffRequest({ path: "x.ts" })).toBeNull();
    expect(fileDiffRequest({ repoName: "github.com/a/b" })).toBeNull();
  });
});

describe("fileDiffTabLabel", () => {
  it("is the file's name, with the short commit or 'uncommitted'", () => {
    expect(fileDiffTabLabel({ path: "src/a.ts", hash: "0123456789" })).toEqual({
      title: "a.ts",
      description: "0123456",
    });
    expect(fileDiffTabLabel({ path: "a.ts", branch: "dev" })).toEqual({
      title: "a.ts",
      description: "uncommitted",
    });
    expect(fileDiffTabLabel({})).toEqual({});
  });
});
