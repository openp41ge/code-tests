/**
 * Unit tests for `deriveRepoName` — the one rule that turns a clone URL into
 * the repository's workspace name (and its folder under the repos directory).
 * Its output must stay stable: existing clones live at these paths.
 */
import { describe, it, expect } from "vitest";
import { deriveRepoName, validateRepoUrl } from "@openp41ge-sdk";

describe("deriveRepoName", () => {
  it("derives names from SSH git@ URLs", () => {
    expect(deriveRepoName("git@github.com:acme/widget.git")).toBe("github.com/acme/widget");
  });
  it("derives names from HTTPS URLs", () => {
    expect(deriveRepoName("https://github.com/acme/widget.git")).toBe("github.com/acme/widget");
  });
  it("gives the SSH and HTTPS URLs of one repo the same name", () => {
    expect(deriveRepoName("git@github.com:acme/widget.git")).toBe(
      deriveRepoName("https://github.com/acme/widget"),
    );
  });
  it("handles nested org paths", () => {
    expect(deriveRepoName("https://gitlab.com/org/team/proj.git")).toBe("gitlab.com/org/team/proj");
    expect(deriveRepoName("git@gitlab.com:group/sub/project.git")).toBe(
      "gitlab.com/group/sub/project",
    );
  });
  it("handles custom hosts", () => {
    expect(deriveRepoName("https://gitlab.example.com/org/proj.git")).toBe(
      "gitlab.example.com/org/proj",
    );
  });
  it("handles bare hosts", () => {
    expect(deriveRepoName("https://github.com/widget")).toBe("github.com/widget");
  });
  it("drops any user, not just git@, from the name", () => {
    expect(deriveRepoName("deploy@git.example.com:team/app.git")).toBe("git.example.com/team/app");
    expect(deriveRepoName("https://alice@gitlab.com/org/app.git")).toBe("gitlab.com/org/app");
  });
  it("leaves a bare single-segment name unchanged", () => {
    expect(deriveRepoName("test")).toBe("test");
  });
});

describe("validateRepoUrl", () => {
  it.each([
    "git@github.com:acme/app.git",
    "git@github.com:acme/app",
    "deploy@git.example.com:team/sub/app.git",
    "https://github.com/acme/app",
    "https://github.com/acme/app.git",
    "https://alice@gitlab.com/org/app.git",
    "https://git.example.com:8443/org/app.git",
  ])("accepts %s", (url) => {
    expect(validateRepoUrl(url)).toBeNull();
  });

  it.each([
    "",
    "app",
    "acme/app",
    "github.com/acme/app",
    "http://github.com/acme/app",
    "ssh://git@github.com/acme/app.git",
    "git@github.com",
    "git@github.com:",
    "@github.com:acme/app",
    "https://github.com",
    "https://github.com/",
    "git@github.com:acme/app.git extra",
  ])("rejects %j", (url) => {
    expect(validateRepoUrl(url)).toMatch(/git@|https:\/\//);
  });

  it("suggests the colon form when an SSH URL uses a slash after the host", () => {
    expect(validateRepoUrl("git@github.com/openp41ge/app-tests.git")).toBe(
      "SSH URLs need a colon after the host: git@github.com:openp41ge/app-tests.git",
    );
    expect(validateRepoUrl("deploy@git.example.com/team/app")).toContain(
      "deploy@git.example.com:team/app",
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(validateRepoUrl("  git@github.com:acme/app.git  ")).toBeNull();
  });
});
