/**
 * Saved tabs of the retired platform git UI open as the git extension's:
 * repository / worktree, commit, file diff, and the History sidebar tab.
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyGitTabs } from "@openp41ge/layout/legacy-git-tabs";

const EXT = "ext:openp41ge-extension-git";

describe("migrateLegacyGitTabs", () => {
  it("opens a saved repository or worktree tab as the Repository tab", () => {
    const out = migrateLegacyGitTabs({
      a: {
        id: "a",
        appType: "git-repository",
        title: "app",
        config: { filePath: "github.com/a/app" },
      },
      b: {
        id: "b",
        appType: "git-repository",
        title: "dev",
        config: { filePath: "github.com/a/app", worktreeBranch: "dev" },
      },
    });
    expect(out.a).toEqual({
      id: "a",
      appType: `${EXT}:repository`,
      title: "app",
      config: { repoName: "github.com/a/app" },
    });
    expect(out.b.config).toEqual({ repoName: "github.com/a/app", branch: "dev" });
  });

  it("opens a saved commit tab as the Commit tab", () => {
    const out = migrateLegacyGitTabs({
      c: {
        id: "c",
        appType: "git-commit-search",
        title: "abc1234",
        config: {
          filePath: JSON.stringify({ repoName: "github.com/a/app", hash: "abc1234def" }),
          message: "x",
        },
      },
    });
    expect(out.c).toMatchObject({
      appType: `${EXT}:commit`,
      config: { repoName: "github.com/a/app", hash: "abc1234def" },
    });
  });

  it("opens a saved commit file diff as the File diff tab", () => {
    const out = migrateLegacyGitTabs({
      d: {
        id: "d",
        appType: "commit-file-diff",
        title: "a.ts",
        isPreview: true,
        config: {
          filePath: JSON.stringify({ repoName: "github.com/a/app", hash: "abc", path: "src/a.ts" }),
          text: "cached",
          rows: [],
        },
      },
    });
    expect(out.d).toEqual({
      id: "d",
      appType: `${EXT}:file-diff`,
      title: "a.ts",
      isPreview: true,
      config: { repoName: "github.com/a/app", path: "src/a.ts", hash: "abc" },
    });
  });

  it("opens the History sidebar tab as the extension's Git History Search", () => {
    const out = migrateLegacyGitTabs({
      h: { id: "h", appType: "git", title: "History", pinned: true },
    });
    expect(out.h).toEqual({
      id: "h",
      appType: `${EXT}:history-search`,
      title: "Git History Search",
      pinned: true,
    });
  });

  it("leaves other tabs, and old tabs it cannot read, as they are (the same object when clean)", () => {
    const clean = { f: { id: "f", appType: "file-viewer", title: "x", config: {} } };
    expect(migrateLegacyGitTabs(clean)).toBe(clean);
    const broken = {
      g: { id: "g", appType: "commit-file-diff", title: "?", config: { filePath: "{nope" } },
    };
    expect(migrateLegacyGitTabs(broken)).toBe(broken);
  });

  it("is idempotent", () => {
    const once = migrateLegacyGitTabs({
      a: {
        id: "a",
        appType: "git-repository",
        title: "app",
        config: { filePath: "github.com/a/app" },
      },
    });
    expect(migrateLegacyGitTabs(once)).toBe(once);
  });
});

describe("reading a workspace file", () => {
  it("maps its saved git tabs and History sidebar tab", async () => {
    const { migrateWorkspaceFileData } = await import("@openp41ge/layout/workspace-file");
    const data = migrateWorkspaceFileData({
      editorTabs: {
        a: {
          id: "a",
          appType: "git-repository",
          title: "app",
          config: { filePath: "github.com/a/app" },
        },
      },
      systemTabs: { h: { id: "h", appType: "git", title: "History", pinned: false } },
    });
    expect(data.editorTabs?.a?.appType).toBe(`${EXT}:repository`);
    expect(data.systemTabs?.h?.appType).toBe(`${EXT}:history-search`);
  });
});
