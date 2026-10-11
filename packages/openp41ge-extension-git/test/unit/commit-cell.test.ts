/** The Commit tab's params (a dropped `git-commit`'s fields) and its label. */
import { describe, it, expect } from "vitest";
import { commitParams, commitTabLabel } from "@openp41ge-extension-git/commit-cell";

describe("commitParams", () => {
  it("reads the repository and commit", () => {
    expect(
      commitParams({ repoName: "github.com/a/b", hash: "abcdef123", shortHash: "abcdef1" }),
    ).toEqual({ repoName: "github.com/a/b", hash: "abcdef123", shortHash: "abcdef1" });
    expect(commitParams({ repoName: "github.com/a/b" })).toBeNull();
  });
});

describe("commitTabLabel", () => {
  it("is the short commit, its repository muted", () => {
    expect(commitTabLabel({ repoName: "github.com/a/b", hash: "abcdef123" })).toEqual({
      title: "abcdef1",
      description: "github.com/a/b",
    });
  });
});
