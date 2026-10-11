/**
 * The Repository tab's params (`{ repoName, branch? }`, opened or dropped —
 * the platform gives a consumer the payload's fields), and its label.
 */
import { describe, it, expect } from "vitest";
import { repositoryParams, repositoryTabLabel } from "@openp41ge-extension-git/repository-cell";

describe("repositoryParams", () => {
  it("reads the tab's repository and branch", () => {
    expect(repositoryParams({ repoName: "github.com/a/b", branch: "dev" })).toEqual({
      repoName: "github.com/a/b",
      branch: "dev",
    });
    expect(repositoryParams({ repoName: "github.com/a/b" })).toEqual({
      repoName: "github.com/a/b",
    });
    expect(repositoryParams({})).toBeNull();
  });
});

describe("repositoryTabLabel", () => {
  it("labels a worktree by its branch, its repository muted", () => {
    expect(repositoryTabLabel({ repoName: "github.com/a/b", branch: "x" })).toMatchObject({
      title: "x",
      description: "github.com/a/b",
    });
  });
});
